#!/usr/bin/env python3
"""Vérification déterministe d'un PDF par comparaison avec un formulaire vierge.

Dépendances Python : opencv-python, numpy, pypdf et pdf2image.
pdf2image nécessite également Poppler installé sur le système.

La comparaison d'images est une heuristique : elle ne peut pas prouver à elle
seule qu'un contenu est manuscrit ni l'authenticité d'un document. La ROI de la
mention fixe doit être calibrée sur le modèle réellement utilisé.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Sequence


DEFAULT_TEMPLATE_PATH = Path(__file__).with_name("template_page1.png")
DPI = 200

# Seuils modifiables selon la qualité des scans et du modèle.
MAX_EXTRACTABLE_TEXT = 50
MIN_INTERMEDIATE_PIXEL_RATIO = 0.001
MIN_LAPLACIAN_VARIANCE = 1.0
MIN_KEYPOINTS = 8
MIN_INLIER_RATIO = 0.30
PIXEL_DIFFERENCE_THRESHOLD = 35
MAX_MENTION_ROI_DIFFERENCE_RATIO = 0.05
MIN_REFERENCE_MARK_RATIO = 0.0005
MIN_ADDED_INK_RATIO = 0.0005


def _result(valid: bool, status: str, **details: Any) -> dict[str, Any]:
    """Construit un résultat JSON-sérialisable."""
    return {"valide": valid, "status": status, "details": details}


def _parse_roi(
    roi: Sequence[float] | None, width: int, height: int
) -> tuple[int, int, int, int] | None:
    """Convertit une ROI normalisée (x, y, largeur, hauteur) en pixels."""
    if roi is None:
        return None
    if len(roi) != 4:
        raise ValueError("La ROI doit contenir x, y, largeur et hauteur.")

    x, y, roi_width, roi_height = (float(value) for value in roi)
    if (
        x < 0
        or y < 0
        or roi_width <= 0
        or roi_height <= 0
        or x + roi_width > 1
        or y + roi_height > 1
    ):
        raise ValueError("La ROI normalisée doit rester dans l'intervalle [0, 1].")

    left = round(x * width)
    top = round(y * height)
    right = round((x + roi_width) * width)
    bottom = round((y + roi_height) * height)
    return left, top, max(1, right - left), max(1, bottom - top)


def verifier_copie(
    pdf_path: str | Path,
    template_path: str | Path = DEFAULT_TEMPLATE_PATH,
    mention_roi: Sequence[float] | None = None,
) -> dict[str, Any]:
    """Valide la structure d'un PDF et sa correspondance avec le modèle.

    Args:
        pdf_path: Chemin du PDF importé.
        template_path: Image vierge de référence.
        mention_roi: ROI normalisée (x, y, largeur, hauteur) contenant la
            mention fixe. Cette ROI est obligatoire pour valider la structure.

    Returns:
        Dictionnaire JSON-sérialisable avec ``valide``, ``status`` et ``details``.
    """
    try:
        import cv2
        import numpy as np
        from pdf2image import convert_from_path
        from pypdf import PdfReader
    except ImportError as exc:
        return _result(
            False,
            "DEPENDENCY_ERROR",
            message=f"Dépendance Python manquante : {exc}",
        )

    pdf_file = Path(pdf_path)
    template_file = Path(template_path)
    if mention_roi is None:
        return _result(
            False,
            "INVALID_TEMPLATE",
            message=(
                "La ROI de la mention fixe n'est pas configurée. "
                "Fournissez mention_roi=(x, y, largeur, hauteur), normalisée "
                "entre 0 et 1, après repérage sur le modèle."
            ),
        )
    if not pdf_file.is_file():
        return _result(False, "INVALID_PDF", message="Fichier PDF introuvable.")
    if not template_file.is_file():
        return _result(
            False,
            "INVALID_TEMPLATE",
            message=f"Modèle introuvable : {template_file}",
        )

    # Étape 1 : un PDF riche en texte sélectionnable est rejeté immédiatement.
    try:
        reader = PdfReader(str(pdf_file), strict=True)
        if reader.is_encrypted:
            return _result(False, "INVALID_PDF", message="Le PDF est chiffré.")
        extracted_text = "".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        return _result(
            False,
            "INVALID_PDF",
            message=f"Lecture du PDF impossible : {exc}",
        )

    text_length = len(extracted_text.strip())
    if text_length > MAX_EXTRACTABLE_TEXT:
        return _result(
            False,
            "NOT_A_SCAN",
            extracted_text_length=text_length,
            threshold=MAX_EXTRACTABLE_TEXT,
        )
    if not reader.pages:
        return _result(False, "INVALID_PDF", message="Le PDF ne contient aucune page.")

    # Étape 2 : conversion de la première page et contrôles élémentaires de scan.
    try:
        rendered_pages = convert_from_path(
            str(pdf_file), dpi=DPI, first_page=1, last_page=1
        )
        if not rendered_pages:
            return _result(False, "INVALID_PDF", message="La première page est vide.")
        page_rgb = np.asarray(rendered_pages[0].convert("RGB"))
        scan_gray = cv2.cvtColor(page_rgb, cv2.COLOR_RGB2GRAY)
    except Exception as exc:
        return _result(
            False,
            "RENDER_ERROR",
            message=f"Conversion du PDF en image impossible : {exc}",
            hint="Vérifiez que Poppler est installé et accessible.",
        )

    laplacian_variance = float(cv2.Laplacian(scan_gray, cv2.CV_64F).var())
    intermediate_ratio = float(
        np.count_nonzero((scan_gray > 5) & (scan_gray < 250)) / scan_gray.size
    )
    if (
        intermediate_ratio < MIN_INTERMEDIATE_PIXEL_RATIO
        or laplacian_variance < MIN_LAPLACIAN_VARIANCE
    ):
        return _result(
            False,
            "INVALID_SCAN_QUALITY",
            laplacian_variance=laplacian_variance,
            intermediate_pixel_ratio=intermediate_ratio,
            message="L'image ne présente pas assez de détails ou de niveaux de gris.",
        )

    # Le modèle peut être PNG ou JPEG, indépendamment de son extension.
    template_gray = cv2.imread(str(template_file), cv2.IMREAD_GRAYSCALE)
    if template_gray is None or template_gray.size == 0:
        return _result(
            False,
            "INVALID_TEMPLATE",
            message="Le modèle de référence ne peut pas être décodé en image.",
        )

    try:
        roi_pixels = _parse_roi(
            mention_roi, template_gray.shape[1], template_gray.shape[0]
        )
    except (TypeError, ValueError) as exc:
        return _result(False, "INVALID_TEMPLATE", message=str(exc))
    assert roi_pixels is not None
    roi_x, roi_y, roi_width, roi_height = roi_pixels

    # Étape 3 : appariement ORB puis homographie robuste pour recaler le scan.
    orb = cv2.ORB_create(nfeatures=5000)
    template_keypoints, template_descriptors = orb.detectAndCompute(
        template_gray, None
    )
    scan_keypoints, scan_descriptors = orb.detectAndCompute(scan_gray, None)
    if (
        template_descriptors is None
        or scan_descriptors is None
        or len(template_keypoints) < MIN_KEYPOINTS
        or len(scan_keypoints) < MIN_KEYPOINTS
    ):
        return _result(
            False,
            "INVALID_TEMPLATE",
            message="Pas assez de points caractéristiques pour comparer les images.",
        )

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    pairs = matcher.knnMatch(template_descriptors, scan_descriptors, k=2)
    good_matches = [
        first
        for pair in pairs
        if len(pair) == 2
        for first, second in [pair]
        if first.distance < 0.75 * second.distance
    ]
    if len(good_matches) < MIN_KEYPOINTS:
        return _result(
            False,
            "INVALID_TEMPLATE",
            good_matches=len(good_matches),
            message="Correspondance trop faible avec le modèle de référence.",
        )

    source_points = np.float32(
        [template_keypoints[match.queryIdx].pt for match in good_matches]
    ).reshape(-1, 1, 2)
    destination_points = np.float32(
        [scan_keypoints[match.trainIdx].pt for match in good_matches]
    ).reshape(-1, 1, 2)
    homography, inlier_mask = cv2.findHomography(
        destination_points, source_points, cv2.RANSAC, 5.0
    )
    if homography is None or inlier_mask is None:
        return _result(
            False,
            "INVALID_TEMPLATE",
            good_matches=len(good_matches),
            message="Impossible de calculer le recalage géométrique.",
        )

    inlier_count = int(inlier_mask.sum())
    inlier_ratio = inlier_count / len(good_matches)
    if inlier_count < MIN_KEYPOINTS or inlier_ratio < MIN_INLIER_RATIO:
        return _result(
            False,
            "INVALID_TEMPLATE",
            good_matches=len(good_matches),
            inliers=inlier_count,
            inlier_ratio=inlier_ratio,
            message="Score de correspondance insuffisant avec le modèle.",
        )

    aligned_gray = cv2.warpPerspective(
        scan_gray,
        homography,
        (template_gray.shape[1], template_gray.shape[0]),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=255,
    )

    # Étape 4 : les pixels plus sombres que le modèle représentent l'encre ajoutée.
    difference = cv2.absdiff(template_gray, aligned_gray)
    _, difference_mask = cv2.threshold(
        difference,
        PIXEL_DIFFERENCE_THRESHOLD,
        255,
        cv2.THRESH_BINARY,
    )
    added_ink_mask = (
        (template_gray.astype(np.int16) - aligned_gray.astype(np.int16))
        > PIXEL_DIFFERENCE_THRESHOLD
    )
    added_ink_ratio = float(np.count_nonzero(added_ink_mask) / added_ink_mask.size)

    # La ROI doit contenir de l'encre imprimée dans le modèle puis rester stable
    # après recalage ; ajustez ses coordonnées si le formulaire diffère.
    reference_roi = template_gray[
        roi_y : roi_y + roi_height, roi_x : roi_x + roi_width
    ]
    difference_roi = difference_mask[
        roi_y : roi_y + roi_height, roi_x : roi_x + roi_width
    ]
    reference_mark_ratio = float(np.count_nonzero(reference_roi < 200) / reference_roi.size)
    roi_difference_ratio = float(
        np.count_nonzero(difference_roi) / difference_roi.size
    )
    if reference_mark_ratio < MIN_REFERENCE_MARK_RATIO:
        return _result(
            False,
            "INVALID_TEMPLATE",
            reference_mark_ratio=reference_mark_ratio,
            message="La ROI configurée ne contient pas la mention imprimée attendue.",
        )
    if roi_difference_ratio > MAX_MENTION_ROI_DIFFERENCE_RATIO:
        return _result(
            False,
            "INVALID_TEMPLATE",
            roi_difference_ratio=roi_difference_ratio,
            threshold=MAX_MENTION_ROI_DIFFERENCE_RATIO,
            message="La mention fixe ne correspond pas au modèle après recalage.",
        )
    if added_ink_ratio < MIN_ADDED_INK_RATIO:
        return _result(
            False,
            "NO_ADDED_MARKS",
            added_ink_pixel_ratio=added_ink_ratio,
            threshold=MIN_ADDED_INK_RATIO,
            message="Aucune quantité significative d'encre ajoutée n'a été détectée.",
        )

    return _result(
        True,
        "SUCCESS",
        extracted_text_length=text_length,
        laplacian_variance=laplacian_variance,
        intermediate_pixel_ratio=intermediate_ratio,
        keypoints_reference=len(template_keypoints),
        keypoints_scan=len(scan_keypoints),
        good_matches=len(good_matches),
        inliers=inlier_count,
        inlier_ratio=inlier_ratio,
        added_ink_pixel_ratio=added_ink_ratio,
        mention_roi_difference_ratio=roi_difference_ratio,
        message=(
            "Le PDF correspond au modèle et contient des marques ajoutées. "
            "Ce résultat ne prouve pas que ces marques sont manuscrites."
        ),
    )


def _parse_cli_roi(value: str) -> tuple[float, float, float, float]:
    """Parse une ROI CLI au format x,y,largeur,hauteur."""
    try:
        values = tuple(float(part.strip()) for part in value.split(","))
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "Format attendu : x,y,largeur,hauteur (valeurs entre 0 et 1)."
        ) from exc
    if len(values) != 4:
        raise argparse.ArgumentTypeError(
            "Format attendu : x,y,largeur,hauteur (valeurs entre 0 et 1)."
        )
    return values[0], values[1], values[2], values[3]


def main() -> int:
    """Point d'entrée en ligne de commande ; écrit un seul objet JSON."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", help="PDF à vérifier")
    parser.add_argument(
        "--template",
        default=str(DEFAULT_TEMPLATE_PATH),
        help=f"Image de référence (défaut : {DEFAULT_TEMPLATE_PATH.name})",
    )
    parser.add_argument(
        "--mention-roi",
        type=_parse_cli_roi,
        required=True,
        metavar="X,Y,L,H",
        help="ROI normalisée de la mention fixe, coordonnées entre 0 et 1",
    )
    args = parser.parse_args()
    result = verifier_copie(args.pdf, args.template, args.mention_roi)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["valide"] else 1


if __name__ == "__main__":
    sys.exit(main())
