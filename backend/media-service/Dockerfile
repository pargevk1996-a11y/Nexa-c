FROM python:3.12-slim AS builder
WORKDIR /build
COPY backend/shared /opt/shared
RUN pip install --no-cache-dir /opt/shared
COPY backend/media-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo libwebp7 ffmpeg \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 10001 appuser
RUN mkdir -p /data/media && chown -R appuser:appuser /data/media
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY backend/shared /opt/shared
RUN pip install --no-cache-dir /opt/shared
COPY backend/media-service/app ./app
USER appuser
ENV PYTHONUNBUFFERED=1
EXPOSE 8005
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8005/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8005"]
