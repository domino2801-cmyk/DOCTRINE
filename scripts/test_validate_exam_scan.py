import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

import validate_exam_scan as validator


class ValidateExamScanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        directory = Path(self.temp.name)
        self.pdf = directory / "scan.pdf"
        self.template = directory / "template.png"
        writer = PdfWriter()
        writer.add_blank_page(width=600, height=800)
        with self.pdf.open("wb") as file:
            writer.write(file)

        # Formulaire synthetique reproductible, avec des reperes sur les deux moities.
        self.image = np.full((800, 1200), 255, dtype=np.uint8)
        rng = np.random.default_rng(42)
        for _ in range(500):
            x = int(rng.integers(10, 1190))
            y = int(rng.integers(10, 790))
            cv2.circle(self.image, (x, y), int(rng.integers(2, 6)), int(rng.integers(0, 180)), -1)
        cv2.putText(self.image, "CEC/15 TYPE 1N", (630, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.6, 0, 2)
        self.roi = (625, 125, 210, 35)
        cv2.imencode(".png", self.image)[1].tofile(self.template)

    def validate_with_image(self, image):
        with patch.object(validator, "_render_first_page", return_value=image):
            return validator.validate_exam_scan(self.pdf, self.template, self.roi)

    def test_complete_spread_and_right_page(self):
        for image, expected in ((self.image, "spread"), (self.image[:, 600:], "right")):
            with self.subTest(layout=expected):
                result = self.validate_with_image(image)
                self.assertEqual(result["status"], "SUCCESS", result)
                self.assertTrue(result["valide"])
                self.assertEqual(result["details"]["registration"]["layout"], expected)

    def test_removing_mention_is_rejected(self):
        image = self.image.copy()
        x, y, width, height = self.roi
        image[y:y + height, x:x + width] = 255
        result = self.validate_with_image(image)
        self.assertEqual(result["status"], "INVALID_TEMPLATE")
        self.assertGreater(result["details"]["roi"]["missing_ink_fraction"], 0.20)

    def test_perspective_and_marks_outside_roi(self):
        source = np.float32([[0, 0], [1199, 0], [1199, 799], [0, 799]])
        destination = np.float32([[8, 8], [1190, 5], [1193, 790], [6, 793]])
        transform = cv2.getPerspectiveTransform(source, destination)
        image = cv2.warpPerspective(self.image, transform, (1200, 800), borderValue=255)
        cv2.putText(image, "test", (900, 400), cv2.FONT_HERSHEY_SIMPLEX, 1, 0, 2)
        result = self.validate_with_image(image)
        self.assertEqual(result["status"], "SUCCESS", result)
        self.assertGreater(result["details"]["page_difference_fraction"], 0)

    def test_unrelated_image_is_rejected(self):
        image = np.random.default_rng(2).integers(0, 256, self.image.shape, dtype=np.uint8)
        self.assertEqual(self.validate_with_image(image)["status"], "INVALID_TEMPLATE")

    def test_blank_image_is_not_scan(self):
        image = np.full_like(self.image, 255)
        self.assertEqual(self.validate_with_image(image)["status"], "NOT_A_SCAN")

    def test_text_on_second_page_is_rejected_before_render_or_template(self):
        writer = PdfWriter()
        writer.add_blank_page(width=600, height=800)
        page = writer.add_blank_page(width=600, height=800)
        font = DictionaryObject({
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        })
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})
        })
        stream = DecodedStreamObject()
        stream.set_data(b"BT /F1 12 Tf 10 100 Td (" + b"A" * 51 + b") Tj ET")
        page[NameObject("/Contents")] = writer._add_object(stream)
        with self.pdf.open("wb") as file:
            writer.write(file)
        with patch.object(validator, "_render_first_page") as render:
            result = validator.validate_exam_scan(self.pdf, self.pdf.parent / "missing.png", self.roi)
        self.assertEqual(result["status"], "NOT_A_SCAN")
        self.assertGreater(result["details"]["text_length"], 50)
        render.assert_not_called()

    def test_threshold_is_strictly_greater_than_50(self):
        for length, rejected in ((50, False), (51, True)):
            with self.subTest(length=length), patch.object(validator, "_text_length", return_value=(length, 1)):
                result = self.validate_with_image(self.image)
                self.assertEqual(result["status"] == "NOT_A_SCAN", rejected)

    def test_invalid_or_blank_roi_is_configuration_error(self):
        for roi in ((0, 0, 0, 1), (-1, 0, 50, 50), (100, 100, 2, 2)):
            with self.subTest(roi=roi):
                result = validator.validate_exam_scan(self.pdf, self.template, roi)
                self.assertEqual(result["status"], "CONFIGURATION_ERROR")

    def test_corrupt_pdf_fails(self):
        self.pdf.write_bytes(b"not a pdf")
        self.assertEqual(validator.validate_exam_scan(self.pdf, self.template, self.roi)["status"], "PDF_ERROR")

    def test_missing_poppler_is_explicit(self):
        from pdf2image.exceptions import PDFInfoNotInstalledError

        with patch.object(validator, "_render_first_page", side_effect=PDFInfoNotInstalledError("not found")):
            result = validator.validate_exam_scan(self.pdf, self.template, self.roi)
        self.assertEqual(result["status"], "DEPENDENCY_ERROR")


if __name__ == "__main__":
    unittest.main()
