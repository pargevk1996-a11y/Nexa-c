# Nexa — DevOps & operations

Operations guide for CI/CD, environments, observability, backups, and disaster recovery.

---

## Quick reference

| Task | Command |
|------|---------|
| Local CI (lint + test + build) | `make ci-local` |
| Dev stack | `make up` |
| Staging stack | `cp .env.staging.example .env.staging && make staging-up` |
| Production compose | `cp .env.prod.example .env.prod && make prod-up` |
| Observability (metrics + traces) | `make optional-up` |
| ELK logging profile | `make optional-logging-up` |
| Postgres backup | `make backup-db` |
| Postgres restore | `bash scripts/restore-postgres.sh chat_db backups/postgres/chat_db_*.sql.gz` |
| DB migrations | `make db-migrate` |

---

## CI/CD

GitHub Actions workflows live in `.github/workflows/`:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | PR / push to main, develop | Ruff lint, pytest smoke, frontend `npm run build`, compose validate |
| `security.yml` | PR, weekly schedule | Bandit, Trivy (FS + images), CodeQL, Gitleaks (non-blocking) |
| `deploy-staging.yml` | `develop` push or manual | Build smoke + deploy placeholder (wire to your cluster) |

Dependabot updates pip, npm, Docker base images, and GitHub Actions weekly (`.github/dependabot.yml`).

### Run CI locally

```bash
make ci-local
# or
bash scripts/ci-local.sh
```

Requires Python 3.12, Docker (for compose validate), and Node 22 for the frontend build.

### Automated tests

| Suite | Location | Notes |
|-------|----------|-------|
| Smoke `/health` | `tests/smoke/test_health.py` | Loads each FastAPI `app.main` without running servers |
| Shared crypto | `tests/smoke/test_shared.py` | Password hash roundtrip |

There is no full integration test suite yet; CI includes a lightweight job with Postgres/Redis service containers for future expansion.

---

## Environments

| Tier | Compose | Env template |
|------|---------|--------------|
| Dev | `docker-compose.yml` + `--profile dev` | `.env.example` |
| Staging | `+ docker-compose.staging.yml` | `.env.staging.example` |
| Prod (compose) | `+ docker-compose.prod.yml` | `.env.prod.example` |
| Prod (K8s) | `infrastructure/k8s/` | Secrets via vault / `ExternalSecrets` |

Staging enables OpenTelemetry and Prometheus `/metrics` on all services. Never commit real secrets; use `.example` files only.

```bash
# Staging
cp .env.staging.example .env.staging
# edit secrets, then:
docker compose -f docker-compose.yml -f docker-compose.staging.yml --env-file .env.staging up -d --build
```

---

## Security scanning

- **Bandit** — Python SAST (`bandit -r backend/`)
- **Trivy** — filesystem and container images (CI reports HIGH/CRITICAL; exit code 0 to avoid blocking until baselines exist)
- **CodeQL** — Python + TypeScript analysis
- **Gitleaks** — secret detection in git history (continue-on-error in CI)
- **Dependabot** — dependency PRs

Rotate JWT keys with `scripts/generate-jwt-keys.sh` and separate keys per environment.

---

## Observability

### Metrics (Prometheus)

Each FastAPI service exposes `GET /metrics` when `PROMETHEUS_METRICS_ENABLED` is not `false`. Shared setup: `securechat_shared.observability.setup_observability`.

```bash
make optional-up   # Prometheus :9090, Grafana :3000
```

Grafana is provisioned from `infrastructure/observability/grafana/`. Default login: see `GRAFANA_USER` / `GRAFANA_PASSWORD` in compose optional file.

### Tracing (OpenTelemetry → Jaeger)

Set `OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318/v1/traces` (staging overlay does this).

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile observability up -d
# Jaeger UI: http://localhost:16686
```

Collector config: `infrastructure/observability/otel-collector-config.yaml`.

### Health checks

All services implement `GET /health`. Docker Compose and K8s manifests use these for probes.

---

## Centralized logging (optional ELK)

```bash
make optional-logging-up
# Elasticsearch :9200, Kibana :5601
```

Filebeat stub (`infrastructure/logging/filebeat.yml`) ships container logs when the `logging` profile is active. For production, prefer managed OpenSearch/Elastic Cloud or Loki + Promtail.

---

## Backups

### Postgres

```bash
make backup-db
# or with custom retention:
BACKUP_RETENTION_DAYS=30 BACKUP_DIR=./backups/postgres bash scripts/backup-postgres.sh
```

Creates per-database `*.sql.gz` under `backups/postgres/`. Default retention: 14 days.

**Restore:**

```bash
bash scripts/restore-postgres.sh chat_db backups/postgres/chat_db_20260101T120000Z.sql.gz
make db-migrate
```

Run backups on a cron host or Kubernetes CronJob with `pg_dump` network access to Postgres.

### MinIO (object storage)

When using the `objectstore` profile:

```bash
bash scripts/backup-minio.sh
```

Requires [MinIO client `mc`](https://min.io/docs/minio/linux/reference/minio-mc.html). Mirrors bucket to `backups/minio/`.

---

## Disaster recovery

| Metric | Target (guidance) | Notes |
|--------|-------------------|-------|
| **RPO** | 24 h (daily backups) or 1 h with hourly dumps | Tune `BACKUP_RETENTION_DAYS` and cron frequency |
| **RTO** | 2–4 h for full stack restore | Depends on managed DB vs self-hosted |

### Restore procedure (compose)

1. Stop traffic: scale down gateway / ingress.
2. Restore Postgres per database (`scripts/restore-postgres.sh`).
3. Restore MinIO mirror if media metadata points to object keys.
4. Run `make db-migrate` if schema drifted.
5. Verify: `curl -sk https://localhost/health` or staging URL.
6. Re-enable traffic; watch Grafana/Jaeger for errors.

### Failover (production)

- Use managed Postgres with automatic failover (RDS/Aurora, Cloud SQL).
- Redis: ElastiCache cluster or Redis Sentinel.
- Stateless services (api-gateway, ws-gateway) scale horizontally; no local state beyond Redis connection registry.
- Document runbook owner and escalation in your on-call system.

### DR checklist

- [ ] Latest `backup-db` artifact off-site (S3/GCS)
- [ ] JWT keys and `DATA_ENCRYPTION_KEY` in vault (restore before app start)
- [ ] DNS/ingress points to recovery region
- [ ] Smoke test: register, send message, WS connect

---

## Kubernetes

See [infrastructure/k8s/README.md](../../infrastructure/k8s/README.md). Base manifests include namespace, ConfigMap, sample `api-gateway` Deployment, and Ingress stub. Extend with remaining services, HPA, and `ExternalSecrets` before production use.

---

## Limitations & gaps

- Deploy workflows are placeholders until a registry and cluster credentials are configured.
- Trivy/Gitleaks do not fail CI by default; tighten `exit-code` when baselines are clean.
- No Loki stack yet (ELK optional profile only).
- Frontend has build/typecheck only; no Vitest suite in CI.
- Full E2E tests (Playwright) not wired.
- K8s manifests cover api-gateway sample only; remaining services need Deployments/Services.

For architecture context see [ARCHITECTURE.md](./ARCHITECTURE.md) and [DEPLOYMENT.md](./DEPLOYMENT.md).
