"""Optional Prometheus metrics and OpenTelemetry tracing for FastAPI services."""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI

logger = logging.getLogger(__name__)


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes", "on")


def setup_observability(app: FastAPI, service_name: str) -> None:
    """Wire metrics and tracing when env vars are set (no-op otherwise)."""
    _setup_metrics(app, service_name)
    _setup_tracing(app, service_name)


def _setup_metrics(app: FastAPI, service_name: str) -> None:
    if not _truthy(os.getenv("PROMETHEUS_METRICS_ENABLED", "true")):
        return
    try:
        from prometheus_fastapi_instrumentator import Instrumentator
    except ImportError:
        logger.debug("prometheus_fastapi_instrumentator not installed; skip /metrics")
        return

    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        excluded_handlers={"/metrics", "/health"},
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def _setup_tracing(app: FastAPI, service_name: str) -> None:
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    if not endpoint and not _truthy(os.getenv("OTEL_ENABLED")):
        return
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logger.warning("OpenTelemetry packages missing; tracing disabled for %s", service_name)
        return

    resource = Resource.create(
        {
            "service.name": service_name,
            "deployment.environment": os.getenv("APP_ENV", "development"),
        }
    )
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=endpoint or "http://otel-collector:4318/v1/traces")
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app, excluded_urls="/health,/metrics")
    logger.info("OpenTelemetry tracing enabled for %s -> %s", service_name, endpoint or "otel-collector")
