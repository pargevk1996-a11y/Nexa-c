# Nexa — Production bar

> **This is not a toy messenger.** Nexa is engineered to compete with Telegram, Signal, and Discord on architecture, security, and UX — not as a weekend CRUD demo.

This document defines what **production-ready** means in this repository. Every feature, PR, and design decision is measured against it.

---

## 1. Product positioning

| Competitor | What we take | What we add |
|------------|--------------|-------------|
| **Telegram** | Speed, chat list UX, folders, channels, media richness | Secure-by-default, zero-trust edge, no phone-only lock-in |
| **Signal** | E2EE trust model, minimal metadata, device safety | Full desktop UX, communities, media pipeline, search |
| **Discord** | Spaces, roles, voice rooms, threads (roadmap) | Private DMs with same security bar as secret chats |

**One sentence:** Nexa is a **secure-first, realtime messenger** with Telegram-grade UX and Signal-grade trust boundaries, built on a **real distributed systems** stack.

---

## 2. Anti-patterns (never ship)

| Toy pattern | Production replacement |
|-------------|------------------------|
| Monolith with chat + auth + media in one process | Bounded microservices + gateway |
| In-memory chat as “the database” | Postgres partitions + repository layer |
| Polling for messages | WebSocket gateway + Redis/NATS fan-out |
| `localStorage` as source of truth | Server sync + encrypted offline cache |
| Demo mode as default product | **Local preview** only for UX/dev; live API is default after login |
| No tests in CI | Unit + integration + WS + security + E2E in GitHub Actions |
| Secrets in repo | `.env.example` only; vault/K8s secrets in prod |
| “We’ll add observability later” | Metrics, traces, logs from day one of a service |
| UI without loading/error/empty states | Skeletons, retry, offline queue |
| Copy-paste security (CORS `*`, no CSRF) | Gateway CSRF, JWT rotation, rate limits |

---

## 3. Engineering pillars

### 3.1 Architecture

- **Edge → Gateway → Services → Data** — no business logic in Nginx or gateway beyond auth/routing.
- **Single writer per aggregate** — messages owned by `chat-service`, sessions by `auth-service`.
- **Horizontal scale** — WS nodes stateless; connection registry in Redis; partition-ready schema.
- **Eventual consistency with explicit sync** — `after_seq`, offline queue, conflict policy documented in [OFFLINE.md](./OFFLINE.md).

### 3.2 Security

- RS256 JWT (or HS256 dev-only), refresh rotation + reuse detection.
- Device-bound sessions, 2FA, WebAuthn, audit events.
- E2EE-ready envelope storage (client encrypt; server sees metadata only).
- CSP, HSTS (prod), screenshot deterrence, encrypted local vault.

### 3.3 UX

- Optimistic send **&lt; 16ms** paint.
- Telegram layout: left list · center thread · right profile.
- Dark/light/system theme, compact mode, reduced motion.
- No jank: virtualized lists (target), lazy media, stable scroll.

### 3.4 Operations

- Docker Compose (dev/staging) + K8s base (prod path).
- CI: lint, pytest, Vitest, Playwright, compose validate.
- Prometheus, Grafana, Jaeger, ELK profiles.
- Backups + DR runbook — [DEVOPS.md](./DEVOPS.md).

### 3.5 Quality

- Tests are not optional — see [TESTING.md](./TESTING.md).
- Feature registry in [FEATURES.md](./FEATURES.md) with ✅/🟡/⬜ honesty.

---

## 4. Definition of Done (feature)

A feature is **done** only when:

1. **API** — versioned route, OpenAPI-aligned schema, structured errors `{ error: { code, message } }`.
2. **Persistence** — migration if durable; no silent in-memory-only in prod path.
3. **Realtime** — WS event name in [WS_PROTOCOL.md](./WS_PROTOCOL.md) if user-visible.
4. **Frontend** — loading + error + empty states; works in live mode (not only preview).
5. **Security** — authz check, rate limit if abuse-prone, no secrets in logs.
6. **Tests** — unit or integration coverage for happy path + one failure path.
7. **Docs** — row in FEATURES.md + link from PLATFORM_SPEC if user-facing.

---

## 5. Maturity model

See [MATURITY.md](./MATURITY.md) for tier definitions (T0 prototype → T5 global scale).

**Current target for `main`:** **T3** — production-shaped monorepo, hybrid live/mock chat, full CI, observability optional stack.

**Next milestone (T4):** durable chat repository, NATS bus, E2EE beta, virtualized message list, desktop Tauri shell.

---

## 6. Repository map (real engineering)

```
Clients          → Web (React) · Desktop (planned Tauri) · Mobile (planned RN)
Edge             → Nginx TLS · CDN
Gateway          → api-gateway (REST) · ws-gateway (realtime)
Domain services  → auth · user · contact · chat · presence · media · notify · call · …
Data             → PostgreSQL (per-domain) · Redis · S3 · OpenSearch (planned)
Ops              → GitHub Actions · Prometheus · backups · K8s overlays
```

---

## 7. How to contribute without lowering the bar

- Prefer extending existing services and shared `securechat_shared` over new one-off scripts.
- If you add a shortcut for dev, gate it behind `APP_ENV=development` or **Local preview**, not default UX.
- When mock data is required, label it **Local preview** in UI; keep `demoMode` internal.
- Ask: *“Would Signal/Telegram ship this?”* — if no, document the gap in MATURITY.md instead of pretending.

---

See [PRODUCT_VISION.md](./PRODUCT_VISION.md) · [MASTER_PLAN.md](./MASTER_PLAN.md) · [PLATFORM_SPEC.md](./PLATFORM_SPEC.md) · [MATURITY.md](./MATURITY.md).
