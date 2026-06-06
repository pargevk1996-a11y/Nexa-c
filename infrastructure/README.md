# Infrastructure

Production layout for Nexa. Full architecture: [docs/nexa/BACKEND_ARCHITECTURE.md](../docs/nexa/BACKEND_ARCHITECTURE.md).

## Layout

| Path | Purpose |
|------|---------|
| `nginx/` | TLS termination, proxy to api-gateway & ws-gateway |
| `postgres/init/` | Per-service databases + `02-apply-migrations.sh` |
| `postgres/migrations/` | `chat_db/` (partitioned messages, FTS, audit), `auth_db/` |
| `redis/` | Redis config (password, persistence) |
| `tls/dev/` | Local HTTPS certs (`make certs`) |
| `observability/` | Prometheus scrape config (optional profile) |
| `docker/` | Shared Docker ignore |

## Compose files

| File | Command |
|------|---------|
| `docker-compose.yml` | `make up` — core stack |
| `docker-compose.prod.yml` | `make prod-up` |
| `docker-compose.staging.yml` | `make staging-up` |
| `docker-compose.optional.yml` | `make optional-up` — NATS, MinIO, Prometheus, Grafana, Jaeger, OTel, ELK |

## Optional dev profiles

```bash
# Messaging bus (NATS JetStream)
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile messaging up -d nats

# Object storage (MinIO → S3-compatible API)
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile objectstore up -d minio

# Metrics
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile observability up -d

# Logs (ELK)
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile logging up -d
```

Set `MEDIA_STORAGE_ROOT` / S3 endpoint to MinIO when testing object storage locally.

## Observability & tracing

```bash
make optional-up   # Prometheus :9090, Grafana :3000, Jaeger :16686, OTel collector :4318
```

Services expose `/metrics` and optional OTLP traces via `securechat_shared.observability`.

## Production

- **Kubernetes** — `infrastructure/k8s/` base + staging overlay
- **CDN** — CloudFront / Cloudflare in front of signed media URLs
- **Managed Postgres / Redis** — replace single-node containers
