# Nexa — secure-first messenger

**Production-shaped monorepo** — Telegram-grade UX · Signal-grade security posture · Discord-grade communities (roadmap).

Not a toy demo: microservices, WebSocket gateway, partitioned Postgres, CI/CD, observability, and a full test pyramid.

| | |
|---|---|
| **Platform blueprint** | [docs/nexa/PLATFORM_BLUEPRINT.md](docs/nexa/PLATFORM_BLUEPRINT.md) — full architecture, APIs, WS, deploy, implementation plan |
| **Distributed systems** | [docs/nexa/DISTRIBUTED_SYSTEMS.md](docs/nexa/DISTRIBUTED_SYSTEMS.md) |
| **Product bar** | [docs/nexa/PRODUCTION_BAR.md](docs/nexa/PRODUCTION_BAR.md) |
| **Maturity (honest)** | [docs/nexa/MATURITY.md](docs/nexa/MATURITY.md) |
| **Platform spec** | [docs/nexa/PLATFORM_SPEC.md](docs/nexa/PLATFORM_SPEC.md) |
| **Architecture index** | [docs/nexa/ARCHITECTURE.md](docs/nexa/ARCHITECTURE.md) |

---

## Stack

```
Clients (Web → Desktop → Mobile)
    ↓
Nginx (TLS) → api-gateway (REST) + ws-gateway (realtime)
    ↓
auth · user · contact · chat · presence · media · notify · call · ai · …
    ↓
PostgreSQL · Redis · S3/MinIO · (NATS · OpenSearch — planned)
```

- **Backend:** FastAPI microservices, shared `securechat_shared`, JWT/CSRF, OpenTelemetry hooks  
- **Frontend:** React 19, TypeScript, Zustand, encrypted vault, offline queue, Service Worker  
- **Ops:** Docker Compose (dev/staging/prod), GitHub Actions, Prometheus/Grafana/Jaeger optional profiles  

---

## Quick start

```bash
cp .env.example .env
# Set JWT_ACCESS_SECRET and DB passwords

make certs    # dev TLS
make dev-up   # infra + services + UI
make test     # pytest (unit, integration, WS, security, smoke)
make ci-local # ruff + tests + vitest + build + compose validate
```

| URL | Service |
|-----|---------|
| `https://localhost` | API via Nginx |
| `http://127.0.0.1:5173` | Vite dev UI |
| `http://localhost:8025` | Mailpit (dev) |

---

## Engineering standards

- **Definition of Done:** API + persistence + tests + [FEATURES.md](docs/nexa/FEATURES.md) — see [PRODUCTION_BAR.md](docs/nexa/PRODUCTION_BAR.md)  
- **Contributing (agents/humans):** [AGENTS.md](AGENTS.md)  
- **Tests:** `make test` · `make test-e2e` · [TESTING.md](docs/nexa/TESTING.md)  
- **Deploy / DR:** [DEVOPS.md](docs/nexa/DEVOPS.md)  

---

## Repository layout

```
backend/           # FastAPI services + shared library
frontend/web/      # Nexa web client
infrastructure/    # Nginx, Postgres, Redis, TLS, K8s base
tests/             # unit · integration · websocket · security · e2e · load
docs/nexa/         # Product & engineering documentation
.github/workflows/ # CI, security scanning, deploy stubs
```

---

## Positioning

| Take from | Deliver |
|-----------|---------|
| **Telegram** | Speed, 3-panel UX, folders, channels, rich media |
| **Signal** | E2EE-ready design, device safety, minimal metadata |
| **Discord** | Spaces, voice, roles (phased) |

**Current tier:** T3 production-shaped — see [MATURITY.md](docs/nexa/MATURITY.md) for gaps and T4 exit criteria.

---

## Security

- RS256 JWT (recommended), refresh rotation, 2FA, WebAuthn  
- Rate limits, brute-force guard, audit log, CSP / HSTS in production  
- Details: [docs/nexa/SECURITY.md](docs/nexa/SECURITY.md)  
# Nexa
# Nexa
# Nexa
