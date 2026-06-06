FROM python:3.12-slim AS builder
WORKDIR /build
COPY backend/shared /opt/shared
RUN pip install --no-cache-dir /opt/shared
COPY backend/notification-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim
RUN useradd --create-home --uid 10001 appuser
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY backend/shared /opt/shared
RUN pip install --no-cache-dir /opt/shared
COPY backend/notification-service/app ./app
USER appuser
ENV PYTHONUNBUFFERED=1
EXPOSE 8008
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8008/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8008"]
