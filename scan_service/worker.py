"""Exécute le contrôle sur un fichier temporaire, dans un processus séparé."""

import json
import logging
import sys
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from scripts.validate_exam_scan import validate_exam_scan

TEMPLATE = Path(__file__).with_name("template_page1.png")
ROI = (1670, 720, 45, 230)
MAX_PAGES = 20
MAX_PAGE_SIDE_POINTS = 1600
MAX_PAGE_AREA_POINTS = 1_800_000


def validate(path: Path) -> dict:
    try:
        reader = PdfReader(str(path), strict=True)
        if reader.is_encrypted:
            return {"valide": False, "status": "PDF_ERROR", "details": {"reason": "PDF chiffré"}}
        if not 1 <= len(reader.pages) <= MAX_PAGES:
            return {"valide": False, "status": "PDF_ERROR", "details": {"reason": "Nombre de pages invalide"}}
        for page in reader.pages:
            unit = float(page.user_unit)
            for box in (page.mediabox, page.cropbox):
                width = float(box.width) * unit
                height = float(box.height) * unit
                if not (0 < width <= MAX_PAGE_SIDE_POINTS and 0 < height <= MAX_PAGE_SIDE_POINTS
                        and width * height <= MAX_PAGE_AREA_POINTS):
                    return {"valide": False, "status": "PDF_ERROR", "details": {"reason": "Dimensions de page invalides"}}
    except (PdfReadError, OSError, ValueError, TypeError, KeyError) as exc:
        return {"valide": False, "status": "PDF_ERROR", "details": {"reason": type(exc).__name__}}
    except Exception:
        logging.exception("Erreur inattendue lors de l'analyse du PDF")
        return {"valide": False, "status": "PROCESSING_ERROR", "details": {}}
    return validate_exam_scan(path, TEMPLATE, ROI)


if __name__ == "__main__":
    print(json.dumps(validate(Path(sys.argv[1])), ensure_ascii=False))
