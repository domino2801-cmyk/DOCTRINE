"""Service interne HTTP : le PDF est contrôlé sans être conservé."""

import hmac
import json
import logging
import os
import signal
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BYTES = 10 * 1024 * 1024
TIMEOUT_SECONDS = 40
SLOTS = threading.BoundedSemaphore(1)
ROOT = Path(__file__).resolve().parent.parent
LOGGER = logging.getLogger("scan_service")


def run_worker(data: bytes) -> dict:
    with tempfile.TemporaryDirectory(prefix="doctrine-scan-") as directory:
        path = Path(directory) / "upload.pdf"
        path.write_bytes(data)
        process = subprocess.Popen(
            [sys.executable, "-m", "scan_service.worker", str(path)],
            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, start_new_session=(os.name != "nt"),
        )
        try:
            stdout, stderr = process.communicate(timeout=TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                process.kill()
            else:
                os.killpg(process.pid, signal.SIGKILL)
            process.communicate()
            LOGGER.error("Validation interrompue : délai dépassé")
            return {"valide": False, "status": "PROCESSING_ERROR", "details": {}}
        if process.returncode:
            LOGGER.error("Processus de validation arrêté avec le code %s: %s", process.returncode, stderr[-1000:])
            return {"valide": False, "status": "PROCESSING_ERROR", "details": {}}
        try:
            result = json.loads(stdout)
        except json.JSONDecodeError:
            LOGGER.error("Réponse du processus de validation illisible")
            return {"valide": False, "status": "PROCESSING_ERROR", "details": {}}
        if not isinstance(result, dict) or type(result.get("valide")) is not bool or not isinstance(result.get("status"), str):
            LOGGER.error("Réponse du processus de validation invalide")
            return {"valide": False, "status": "PROCESSING_ERROR", "details": {}}
        return result


class Handler(BaseHTTPRequestHandler):
    server_version = "DoctrineScan"

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self, format, *args):
        # Aucun nom de fichier ou contenu n'est journalisé.
        LOGGER.info("%s %s", self.command, args[1] if len(args) > 1 else "")

    def send_json(self, status: int, body: dict):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path != "/health":
            self.send_json(404, {"error": "Not found"})
            return
        self.send_json(200, {"ok": True})

    def do_POST(self):
        if self.path != "/validate":
            self.send_json(404, {"error": "Not found"})
            return
        expected = "Bearer " + self.server.secret
        if not hmac.compare_digest(self.headers.get("Authorization", "").encode(), expected.encode()):
            self.send_json(401, {"error": "Unauthorized"})
            return
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/pdf":
            self.send_json(415, {"error": "PDF required"})
            return
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self.send_json(411, {"error": "Content-Length required"})
            return
        if not 0 < length <= MAX_BYTES:
            self.send_json(413, {"error": "Invalid file size"})
            return
        if not SLOTS.acquire(blocking=False):
            self.send_json(503, {"error": "Validator busy"})
            return
        try:
            data = self.rfile.read(length)
            if len(data) != length:
                self.send_json(400, {"error": "Incomplete upload"})
                return
            result = run_worker(data)
            self.send_json(200, result)
        except (OSError, subprocess.SubprocessError):
            LOGGER.exception("Échec du traitement de la fiche")
            self.send_json(503, {"error": "Validator unavailable"})
        finally:
            SLOTS.release()


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], secret: str):
        super().__init__(address, Handler)
        self.secret = secret


def main():
    logging.basicConfig(level=logging.INFO)
    secret = os.environ.get("DOCTRINE_SCAN_VALIDATOR_SECRET", "")
    if len(secret) < 32:
        raise SystemExit("DOCTRINE_SCAN_VALIDATOR_SECRET doit contenir au moins 32 caractères.")
    if not (ROOT / "scan_service" / "template_page1.png").is_file():
        raise SystemExit("Le modèle de référence est introuvable.")
    port = int(os.environ.get("PORT", "8080"))
    Server(("0.0.0.0", port), secret).serve_forever()


if __name__ == "__main__":
    main()
