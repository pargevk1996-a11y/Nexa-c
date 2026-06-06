# Nexa — Production maturity matrix

Honest status vs **Telegram + Signal + Discord** class products. Updated as the monorepo evolves.

Legend: ✅ Production-shaped · 🟡 Partial / hybrid · ⬜ Planned · 🔬 Research

---

## Tier overview

| Tier | Name | Description |
|------|------|-------------|
| **T0** | Prototype | Single app, mocks, no CI |
| **T1** | Demo | UI shell + fake data |
| **T2** | Staging-shaped | Microservices, auth, compose, tests |
| **T3** | Production-shaped | **← current target for `main`** — real gateways, CI/CD, observability hooks, hybrid data |
| **T4** | Production-live | Durable chat, NATS, E2EE beta, native clients |
| **T5** | Hyperscale | Multi-region, 1M+ WS, full search, bot platform |

---

## Dimension matrix

| Dimension | T3 (today) | T4 (next) | T5 |
|-----------|------------|-----------|-----|
| **UX / Telegram parity** | 🟡 3-panel layout, folders, pins, media, calls UI | ✅ Virtualized 10k msgs, stories ship | ✅ Full parity + polish |
| **Security / Signal parity** | 🟡 JWT, 2FA, WebAuthn, sessions, audit | ✅ E2EE default DM | ✅ Sealed sender, PSI contact discovery |
| **Communities / Discord** | 🟡 Spaces, roles UI | 🟡 Voice rooms scale | ✅ Stage channels, permissions graph |
| **Realtime** | ✅ ws-gateway, Redis fan-out | ✅ NATS JetStream | ✅ Multi-region CRDT sync |
| **Chat persistence** | 🟡 Schema + migrations; runtime in-memory | ✅ Repository on Postgres | ✅ Sharded partitions |
| **Media** | 🟡 Upload API, lazy UI | ✅ Transcode + CDN | ✅ Global object store |
| **Search** | ⬜ Client filter only | 🟡 OpenSearch | ✅ Semantic + FTS |
| **Clients** | ✅ Web | 🟡 Tauri desktop | ✅ iOS/Android RN |
| **Ops** | ✅ CI, security scan, backups doc | ✅ K8s prod deploy | ✅ SRE on-call, chaos |
| **Tests** | ✅ Unit/int/WS/security/E2E | ✅ Contract tests, load gates | ✅ Soak, fuzz |

---

## What is already “real engineering”

- **12+ FastAPI services** with shared observability, health, Dockerfiles.
- **api-gateway** — JWT, CSRF, proxy, security headers.
- **ws-gateway** — protocol v1, rate limits, Redis registry, horizontal fan-out.
- **Postgres migrations** — partitioned messages, audit, soft delete, FTS prep.
- **Frontend** — Zustand, offline queue, encrypted vault, SW, Telegram layout.
- **DevOps** — GitHub Actions, staging/prod compose, Prometheus/Grafana/Jaeger optional.
- **Testing** — 36+ pytest, Vitest, Playwright, Locust.

---

## Known gaps (do not hide)

| Gap | Impact | Owner path |
|-----|--------|------------|
| Chat messages in-memory in `chat-service` | No multi-instance truth | Repository + NATS in T4 |
| E2EE not default | Signal bar incomplete | Client protocol + envelope store |
| Message list not virtualized | 10k msg scroll risk | `react-virtuoso` + windowing |
| Some settings use local preview fallbacks | Confusing if labeled “demo” | Live API only in prod build |
| K8s manifests partial | No one-click prod | Expand `infrastructure/k8s/` |
| Mobile/desktop clients | Web only | Tauri + RN programs |

---

## Exit criteria T3 → T4

1. `chat-service` reads/writes Postgres for all conversation APIs in prod config.
2. WS events for send/ack/receipt backed by durable seq.
3. E2EE opt-in for secret chats (client encrypt, server blind storage).
4. Playwright E2E covers login → send → receive on CI with docker stack.
5. p99 internal delivery &lt; 150ms in load test gate.

---

See [PRODUCTION_BAR.md](./PRODUCTION_BAR.md) · [FEATURES.md](./FEATURES.md) · [MASTER_PLAN.md](./MASTER_PLAN.md).
