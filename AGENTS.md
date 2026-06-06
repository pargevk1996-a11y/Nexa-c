# Nexa — agent instructions

This repository is a **production-shaped secure messenger**, not a toy demo.

## Read first

1. [docs/nexa/PLATFORM_BLUEPRINT.md](docs/nexa/PLATFORM_BLUEPRINT.md) — complete architecture, APIs, deploy, implementation plan  
2. [docs/nexa/DISTRIBUTED_SYSTEMS.md](docs/nexa/DISTRIBUTED_SYSTEMS.md) — scaling, ordering, idempotency, flags  
3. [docs/nexa/PRODUCTION_BAR.md](docs/nexa/PRODUCTION_BAR.md) — quality bar and anti-patterns  
4. [docs/nexa/MATURITY.md](docs/nexa/MATURITY.md) — honest tier status  
5. [docs/nexa/PLATFORM_SPEC.md](docs/nexa/PLATFORM_SPEC.md) — UI/feature checklist  
6. [docs/nexa/FEATURES.md](docs/nexa/FEATURES.md) — what is ✅ vs 🟡 vs ⬜  

## Rules

- **UI language is English only** — all user-visible copy (labels, hints, errors, settings, modals, toasts) must be English. Do not add Russian or other locales in the interface unless explicitly requested.
- **No toy shortcuts** on `main`: use microservices, structured errors, tests, docs.
- **Do not** add features only to mock/demo path — wire live API or document gap in MATURITY.md.
- User-visible “demo” → call it **Local preview**; keep `demoMode` internal.
- **Minimize diff scope**; match existing patterns in each service.
- **Definition of Done**: API + persistence plan + tests + FEATURES.md row.
- **Never commit** secrets; never disable security CI without explicit user ask.

## Stack

- Backend: FastAPI, Postgres, Redis, shared `securechat_shared`  
- Frontend: React 19, TypeScript, Zustand, WS client, IndexedDB vault  
- Ops: Docker Compose, GitHub Actions, optional Prometheus/Jaeger/ELK  

## Commands

```bash
make dev-up      # local stack
make test        # pytest (excludes load/e2e)
make ci-local    # full local CI
make test-e2e    # Playwright
```
