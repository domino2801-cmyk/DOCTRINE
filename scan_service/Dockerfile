FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY scan_service/requirements.txt scan_service/requirements.txt
RUN pip install --no-cache-dir -r scan_service/requirements.txt
COPY scripts/validate_exam_scan.py scripts/validate_exam_scan.py
COPY scan_service/server.py scan_service/worker.py scan_service/template_page1.png scan_service/
RUN useradd --system --uid 10001 validator
USER 10001
EXPOSE 8080
CMD ["python", "-m", "scan_service.server"]
