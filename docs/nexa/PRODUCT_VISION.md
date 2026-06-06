# Nexa — Product Vision

> **Ultra-fast · Realtime · Minimalistic · Scalable · Secure · Smooth · Responsive · Production-ready**  
> **Clean UI · Modern animations · Dark/light · Mobile-first · Premium · Instant · No lag**

This document is the **product north star** for the messenger. Technical implementation lives in [PLATFORM_SPEC.md](./PLATFORM_SPEC.md) and [MASTER_PLAN.md](./MASTER_PLAN.md).

**Engineering bar (non-negotiable):** [PRODUCTION_BAR.md](./PRODUCTION_BAR.md) · **Honest status:** [MATURITY.md](./MATURITY.md)

---

## 1. Core product principles

| Principle | What it means | How we measure it |
|-----------|---------------|-------------------|
| **Ultra-fast** | Every tap feels immediate; network never blocks the UI thread | Optimistic send paint **< 16ms**; API p99 **< 150ms** in-region |
| **Realtime** | Messages, typing, presence, calls update live | WebSocket delivery; no polling on hot paths |
| **Minimalistic** | Only essential chrome; content-first | ≤ 3 primary nav items visible; no visual noise |
| **Scalable** | Grows from 10 to 10M users without redesign | Horizontally sharded WS; partitioned message store |
| **Secure** | Privacy by default, zero-trust edge | E2EE-ready, JWT rotation, rate limits, encrypted media |
| **Smooth** | 60fps scroll, fluid panels | No layout thrash; `content-visibility` on long lists |
| **Responsive** | One codebase: phone → ultrawide | Mobile-first CSS; resizable desktop panels |
| **Production-ready** | Observable, deployable, recoverable | Healthchecks, structured logs, blue/green deploy |

---

## 2. Interface principles

| Principle | What it means | Implementation |
|-----------|---------------|----------------|
| **Clean UI** | Glass surfaces, clear hierarchy, generous whitespace | `tokens.css`, `premium.css`, glass panels |
| **Modern animations** | Micro-interactions, not circus | `motion.css`, `--ease` / `--ease-spring`, `prefers-reduced-motion` |
| **Minimalist** | Typography + spacing do the work | 4px grid; Inter/Outfit; compact mode toggle |
| **Dark / light mode** | System-aware, one-tap toggle | `applyTheme()`, TopNav toggle, Settings |
| **Mobile-first** | Touch targets, safe areas, single column | `100dvh`, `--tap-min`, bottom nav patterns |
| **Desktop-friendly** | Resizable sidebar/profile, keyboard shortcuts | `ResizableChatShell`, ⌘K search (planned) |
| **Premium feeling** | Violet accent, soft gradients, depth | Accent tokens, neuomorphic shadows, blur |
| **Instant interactions** | No 300ms tap delay | `touch-action: manipulation` on controls |
| **No lag UX** | Skeletons, lazy media, optimistic sends | Skeletons, `LazyMediaImage`, WS offline queue |

---

## 3. Experience targets (non-negotiable)

```
User action          → Perceived response
─────────────────────────────────────────
Tap send             → Bubble visible immediately (optimistic)
Open chat            → Shell + skeleton < 100ms
Scroll 10k messages  → Stable 60fps (virtualization)
Theme switch         → Cross-fade ≤ 320ms
Panel resize         → No reflow jank (CSS variables)
WS reconnect         → Transparent; queue flushes
```

---

## 4. Architecture alignment (current monorepo)

```
Clients (Web → Desktop → Mobile)
    ↓
Edge (TLS, WAF, CDN)
    ↓
API Gateway + WS Gateway
    ↓
Microservices (auth, chat, presence, media, calls, …)
    ↓
PostgreSQL · Redis · (NATS planned) · S3
```

**Today (T3):** Production-shaped monorepo — REST + WS gateways, 12 services, React Telegram-layout UI, CI/CD, tests, observability hooks. Chat runtime is hybrid (live auth + API path; durable store migration in T4).

**Not a toy:** No monolith shortcut, no “demo as product” — local preview is dev-only; see [PRODUCTION_BAR.md](./PRODUCTION_BAR.md).

**T4 evolution:** Durable Postgres chat, NATS bus, E2EE beta, virtualized lists, Tauri desktop, RN mobile.

---

## 5. UI layout (Telegram-grade, minimal chrome)

```
┌ TopNav — brand, search, theme, notifications ─────────────┐
├ Nav ├ Sidebar (chats) ├ Main (messages) ├ Profile (opt) ─┤
└───────────────────────────────────────────────────────────┘
```

Mobile: sidebar ↔ main as full-screen steps. Desktop: three resizable columns.

---

## 6. Roadmap by pillar

### Performance & realtime
- [x] WebSocket gateway + client reconnect
- [x] Optimistic outgoing messages (`chat-bubble-row--sending`)
- [ ] Message list virtualization (10k+ rows)
- [ ] NATS JetStream for cross-node fan-out
- [ ] Edge caching for static assets

### UI / UX
- [x] Design tokens + dark/light
- [x] Glass premium layout (`premium.css`)
- [x] Motion layer (`motion.css`)
- [x] Resizable desktop shell
- [ ] Staggered list enter animations (reduced-motion safe)
- [ ] Global command palette (⌘K)
- [ ] Haptic / sound feedback toggles

### Security
- [x] JWT auth, refresh rotation skeleton
- [x] Privacy shield (blur on unfocus)
- [ ] E2EE protocol (Signal-style)
- [ ] Sealed sender metadata

### Production
- [x] Docker Compose + `make dev-up`
- [ ] K8s manifests + HPA
- [ ] OpenTelemetry traces on gateway + WS

---

## 7. Brand

Default working title: **Nexa** (override via `BRAND_NAME` / build config).  
UI label: **Nexa** (`VITE_BRAND_NAME` / `frontend/web/src/config/brand.ts`).

---

## 8. Related documents

| Doc | Focus |
|-----|--------|
| [PLATFORM_SPEC.md](./PLATFORM_SPEC.md) | APIs, UI map, feature checklist |
| [MASTER_PLAN.md](./MASTER_PLAN.md) | Phases, milestones, team topology |
| [REALTIME.md](./REALTIME.md) | WS, presence, typing |
| [SECURITY.md](./SECURITY.md) | Threat model, crypto |
| [FEATURES.md](./FEATURES.md) | Shipped vs planned features |
