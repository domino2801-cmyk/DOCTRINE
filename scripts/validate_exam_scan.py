"""Controle heuristique d'un PDF par comparaison avec un formulaire vierge.

Ce controle ne prouve ni l'authenticite du document ni la presence d'ecriture
manuscrite. Les seuils doivent etre calibres sur les documents reels.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from pdf2image import convert_from_path
from pdf2image.exceptions import PDFInfoNotInstalledError, PDFPageCountError, PDFSyntaxError
from pypdf import PdfReader
from pypdf.errors import PdfReadError


@dataclass(frozen=True)
class Thresholds:
    # Valeurs initiales indicatives, a ajuster sur un jeu de scans connus.
    max_text_chars: int = 50
    dpi: int = 200
    min_intermediate_fraction: float = 0.005
    min_laplacian_variance: float = 5.0
    orb_features: int = 5000
    match_ratio: float = 0.75
    min_matches: int = 20
    min_inliers: int = 15
    min_inlier_ratio: float = 0.45
    min_inlier_coverage: float = 0.05
    ransac_pixels: float = 3.0
    min_page_coverage: float = 0.85
    max_page_coverage: float = 1.15
    # Differences apres flou, et limites pour la zone de la mention fixe.
    diff_threshold: int = 40
    ink_threshold: int = 160
    min_reference_ink_pixels: int = 30
    max_roi_difference_fraction: float = 0.12
    max_missing_ink_fraction: float = 0.20
    ink_tolerance_pixels: int = 2


def _result(valid: bool, status: str, **details: Any) -> dict[str, Any]:
    return {"valide": valid, "status": status, "details": details}


def _load_template(path: Path) -> np.ndarray:
    # imdecode accepte aussi les chemins Windows contenant des caracteres Unicode.
    image = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if image is None or min(image.shape) < 32:
        raise ValueError("Le modele est illisible ou trop petit.")
    return image


def _text_length(pdf_path: Path, limit: int) -> tuple[int, int]:
    reader = PdfReader(str(pdf_path), strict=True)
    if reader.is_encrypted:
        raise ValueError("Les PDF chiffres ne sont pas acceptes.")
    page_count = len(reader.pages)
    if not page_count:
        raise ValueError("Le PDF ne contient aucune page.")
    length = 0
    for page in reader.pages:
        length += len(page.extract_text() or "")
        if length > limit:
            break
    return length, page_count


def _render_first_page(pdf_path: Path, dpi: int, poppler_path: str | None) -> np.ndarray:
    pages = convert_from_path(
        str(pdf_path), dpi=dpi, first_page=1, last_page=1,
        fmt="ppm", thread_count=1, poppler_path=poppler_path, strict=True,
    )
    if len(pages) != 1:
        raise ValueError("La premiere page n'a pas pu etre convertie.")
    rgb = np.asarray(pages[0].convert("RGB"))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)


def _scan_metrics(image: np.ndarray) -> dict[str, float]:
    intermediate = np.count_nonzero((image > 5) & (image < 250)) / image.size
    sharpness = cv2.Laplacian(image, cv2.CV_64F).var()
    return {
        "intermediate_fraction": float(intermediate),
        "laplacian_variance": float(sharpness),
    }


def _register(
    image: np.ndarray, template: np.ndarray, config: Thresholds
) -> tuple[np.ndarray | None, dict[str, Any]]:
    # RANSAC est initialise pour limiter les variations entre executions.
    cv2.setRNGSeed(0)
    detector = cv2.ORB_create(nfeatures=config.orb_features)
    scan_points, scan_descriptors = detector.detectAndCompute(image, None)
    ref_points, ref_descriptors = detector.detectAndCompute(template, None)
    if scan_descriptors is None or ref_descriptors is None:
        return None, {"reason": "Points caracteristiques insuffisants."}

    pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(
        scan_descriptors, ref_descriptors, k=2
    )
    matches = [pair[0] for pair in pairs if len(pair) == 2
               and pair[0].distance < config.match_ratio * pair[1].distance]
    metrics: dict[str, Any] = {"matches": len(matches)}
    if len(matches) < config.min_matches:
        metrics["reason"] = "Correspondances insuffisantes."
        return None, metrics

    source = np.float32([scan_points[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    target = np.float32([ref_points[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
    homography, mask = cv2.findHomography(source, target, cv2.RANSAC, config.ransac_pixels)
    if homography is None or mask is None or not np.isfinite(homography).all():
        metrics["reason"] = "Homographie introuvable."
        return None, metrics
    inlier_mask = mask.ravel().astype(bool)
    inliers = int(np.count_nonzero(inlier_mask))
    height, width = template.shape
    hull = cv2.convexHull(target[inlier_mask]) if inliers >= 3 else None
    coverage = float(cv2.contourArea(hull) / (width * height)) if hull is not None else 0.0
    metrics.update(inliers=inliers, inlier_ratio=inliers / len(matches), inlier_coverage=coverage)
    if (inliers < config.min_inliers or metrics["inlier_ratio"] < config.min_inlier_ratio
            or coverage < config.min_inlier_coverage):
        metrics["reason"] = "Recalage insuffisant ou trop localise."
        return None, metrics

    scan_height, scan_width = image.shape
    corners = np.float32([[[0, 0], [scan_width - 1, 0],
                           [scan_width - 1, scan_height - 1], [0, scan_height - 1]]])
    projected = cv2.perspectiveTransform(corners, homography)[0]
    if not np.isfinite(projected).all() or not cv2.isContourConvex(projected):
        metrics["reason"] = "Geometrie de page invalide."
        return None, metrics
    page_coverage = float(cv2.contourArea(projected) / (width * height))
    metrics["page_coverage"] = page_coverage
    if not config.min_page_coverage <= page_coverage <= config.max_page_coverage:
        metrics["reason"] = "Dimensions de page incompatibles."
        return None, metrics
    aligned = cv2.warpPerspective(
        image, homography, (width, height), flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT, borderValue=255,
    )
    return aligned, metrics


def _check_roi(
    aligned: np.ndarray, template: np.ndarray, roi: tuple[int, int, int, int],
    config: Thresholds,
) -> dict[str, Any]:
    # ROI = x, y, largeur, hauteur, en pixels dans l'image de reference.
    x, y, width, height = roi
    ref = template[y:y + height, x:x + width]
    scan = aligned[y:y + height, x:x + width]
    ref_blur = cv2.GaussianBlur(ref, (3, 3), 0)
    scan_blur = cv2.GaussianBlur(scan, (3, 3), 0)
    difference = cv2.absdiff(ref_blur, scan_blur)
    _, changes = cv2.threshold(difference, config.diff_threshold, 255, cv2.THRESH_BINARY)
    ref_ink = ref_blur < config.ink_threshold
    scan_ink = (scan_blur < config.ink_threshold).astype(np.uint8)
    ink_pixels = int(np.count_nonzero(ref_ink))
    if ink_pixels < config.min_reference_ink_pixels:
        raise ValueError("La zone choisie ne contient pas assez d'encre dans le modele.")
    radius = config.ink_tolerance_pixels
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1))
    nearby_ink = cv2.dilate(scan_ink, kernel).astype(bool)
    return {
        "reference_ink_pixels": ink_pixels,
        "difference_fraction": float(np.count_nonzero(changes) / changes.size),
        "missing_ink_fraction": float(np.count_nonzero(ref_ink & ~nearby_ink) / ink_pixels),
    }


def _page_difference(aligned: np.ndarray, template: np.ndarray, config: Thresholds) -> float:
    # Ce masque mesure les changements, sans pouvoir certifier leur origine manuscrite.
    ref = cv2.GaussianBlur(template, (3, 3), 0)
    scan = cv2.GaussianBlur(aligned, (3, 3), 0)
    _, changes = cv2.threshold(cv2.absdiff(ref, scan), config.diff_threshold, 255, cv2.THRESH_BINARY)
    return float(np.count_nonzero(changes) / changes.size)


def validate_exam_scan(
    pdf_path: str | Path,
    template_path: str | Path,
    roi: tuple[int, int, int, int],
    *,
    poppler_path: str | None = None,
    thresholds: Thresholds | None = None,
    layout: str = "auto",
) -> dict[str, Any]:
    """Controle le PDF ; roi contient x, y, largeur, hauteur dans le modele complet.

    layout accepte auto, spread (planche complete) ou right (page droite seule).
    SUCCESS signifie uniquement que les tests heuristiques ont ete passes.
    """
    config = thresholds or Thresholds()
    pdf = Path(pdf_path)
    template_file = Path(template_path)
    if not pdf.is_file():
        return _result(False, "FILE_ERROR", message="PDF introuvable ou inaccessible.")
    try:
        text_length, page_count = _text_length(pdf, config.max_text_chars)
        if text_length > config.max_text_chars:
            return _result(False, "NOT_A_SCAN", text_length=text_length, page_count=page_count)
        if not template_file.is_file():
            return _result(False, "CONFIGURATION_ERROR", message="Modele introuvable ou inaccessible.")
        try:
            template = _load_template(template_file)
            if len(roi) != 4 or any(not isinstance(value, int) or isinstance(value, bool) for value in roi):
                raise ValueError("La ROI doit contenir quatre entiers : x, y, largeur, hauteur.")
            if layout not in ("auto", "spread", "right"):
                raise ValueError("Le cadrage doit etre auto, spread ou right.")
            x, y, width, height = roi
            if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > template.shape[1] or y + height > template.shape[0]:
                raise ValueError("La ROI doit etre entierement incluse dans le modele.")
            # Une zone blanche ne peut pas valider la presence de la mention.
            if np.count_nonzero(template[y:y + height, x:x + width] < config.ink_threshold) < config.min_reference_ink_pixels:
                raise ValueError("La ROI du modele ne contient pas assez d'encre.")
        except (OSError, ValueError, cv2.error) as exc:
            return _result(False, "CONFIGURATION_ERROR", message=str(exc))
        image = _render_first_page(pdf, config.dpi, poppler_path)
        scan_metrics = _scan_metrics(image)
        if (scan_metrics["intermediate_fraction"] < config.min_intermediate_fraction
                or scan_metrics["laplacian_variance"] < config.min_laplacian_variance):
            return _result(False, "NOT_A_SCAN", reason="Aspect matriciel insuffisant.",
                           text_length=text_length, scan=scan_metrics)
        # Le modele fourni est une planche double ; la page d'examen est a droite.
        selected_layout = layout
        if selected_layout == "auto":
            selected_layout = "spread" if image.shape[1] > image.shape[0] else "right"
        selected_roi = roi
        if selected_layout == "right":
            split = template.shape[1] // 2
            if x < split:
                return _result(False, "CONFIGURATION_ERROR", message="La ROI doit etre situee dans la moitie droite du modele.")
            template = template[:, split:]
            selected_roi = (x - split, y, width, height)
        aligned, registration = _register(image, template, config)
        registration["layout"] = selected_layout
        if aligned is None:
            return _result(False, "INVALID_TEMPLATE", registration=registration)
        difference_fraction = _page_difference(aligned, template, config)
        try:
            roi_metrics = _check_roi(aligned, template, selected_roi, config)
        except ValueError as exc:
            return _result(False, "CONFIGURATION_ERROR", message=str(exc))
        if (roi_metrics["difference_fraction"] > config.max_roi_difference_fraction
                or roi_metrics["missing_ink_fraction"] > config.max_missing_ink_fraction):
            return _result(False, "INVALID_TEMPLATE", registration=registration, roi=roi_metrics)
        return _result(True, "SUCCESS", text_length=text_length, page_count=page_count,
                       scan=scan_metrics, registration=registration, roi=roi_metrics,
                       page_difference_fraction=difference_fraction)
    except PDFInfoNotInstalledError as exc:
        return _result(False, "DEPENDENCY_ERROR", message=f"Poppler indisponible : {exc}")
    except (PdfReadError, PDFPageCountError, PDFSyntaxError, ValueError, OSError) as exc:
        return _result(False, "PDF_ERROR", message=str(exc))
    except cv2.error as exc:
        return _result(False, "PROCESSING_ERROR", message=str(exc))
    except Exception as exc:
        # Toute erreur inattendue reste un echec explicite, jamais une validation.
        return _result(False, "PROCESSING_ERROR", error_type=type(exc).__name__, message=str(exc))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", help="Chemin du PDF a verifier")
    parser.add_argument("--template", default="template_page1.png", help="Image du modele vierge")
    parser.add_argument("--roi", nargs=4, type=int, required=True, metavar=("X", "Y", "LARGEUR", "HAUTEUR"))
    parser.add_argument("--poppler-path", help="Dossier contenant pdfinfo et pdftoppm")
    parser.add_argument("--layout", choices=("auto", "spread", "right"), default="auto")
    args = parser.parse_args()
    result = validate_exam_scan(
        args.pdf, args.template, tuple(args.roi), poppler_path=args.poppler_path,
        layout=args.layout,
    )
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["valide"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
