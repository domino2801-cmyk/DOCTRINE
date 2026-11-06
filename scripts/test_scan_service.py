import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from pypdf import PdfWriter

from scan_service import server, worker


class ScanServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.secret = "a" * 40
        cls.httpd = server.Server(("127.0.0.1", 0), cls.secret)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.thread.join()
        cls.httpd.server_close()

    def request(self, headers=None, body=b"%PDF-1.7\n", path="/validate"):
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=5)
        self.addCleanup(connection.close)
        connection.request("POST", path, body=body, headers=headers or {})
        response = connection.getresponse()
        return response.status, json.loads(response.read())

    def headers(self):
        return {"Authorization": "Bearer " + self.secret, "Content-Type": "application/pdf"}

    def test_bad_secret_never_runs_worker(self):
        with patch.object(server, "run_worker") as worker:
            status, _ = self.request()
        self.assertEqual(status, 401)
        worker.assert_not_called()

    def test_success_and_rejection_are_returned_without_changing_result(self):
        for result in (
            {"valide": True, "status": "SUCCESS", "details": {}},
            {"valide": False, "status": "INVALID_TEMPLATE", "details": {}},
        ):
            with self.subTest(result=result), patch.object(server, "run_worker", return_value=result) as worker:
                status, received = self.request(self.headers())
                self.assertEqual(status, 200)
                self.assertEqual(received, result)
                worker.assert_called_once_with(b"%PDF-1.7\n")

    def test_service_rejects_bad_type_and_empty_content(self):
        status, _ = self.request({"Authorization": "Bearer " + self.secret}, b"pdf")
        self.assertEqual(status, 415)
        status, _ = self.request(self.headers(), b"")
        self.assertEqual(status, 413)

    def test_worker_real_corrupt_pdf(self):
        status, result = self.request(self.headers(), b"not a pdf")
        self.assertEqual(status, 200)
        self.assertFalse(result["valide"])
        self.assertEqual(result["status"], "PDF_ERROR")

    def test_busy_rejects_without_processing(self):
        server.SLOTS.acquire()
        try:
            with patch.object(server, "run_worker") as worker:
                status, _ = self.request(self.headers())
            self.assertEqual(status, 503)
            worker.assert_not_called()
        finally:
            server.SLOTS.release()

    def test_worker_rejects_oversized_pages_and_too_many_pages(self):
        for count, width in ((1, 2000), (21, 500)):
            with self.subTest(count=count, width=width), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "document.pdf"
                writer = PdfWriter()
                for _ in range(count):
                    writer.add_blank_page(width=width, height=800)
                with path.open("wb") as file:
                    writer.write(file)
                with patch.object(worker, "validate_exam_scan") as validate:
                    result = worker.validate(path)
                self.assertEqual(result["status"], "PDF_ERROR")
                validate.assert_not_called()


if __name__ == "__main__":
    unittest.main()
