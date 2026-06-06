# Nexa — Frontend architecture (production-grade)

> **Stack:** React 19 + TypeScript + Vite SPA (Next.js optional for marketing/SSR phase).  
> **State:** Zustand (global) + React Context (feature domains, migration in progress).  
> **Realtime:** WebSocket client with reconnect + offline queue.  
> **Offline:** Service Worker (shell) + IndexedDB (data).

---

## Layer diagram

```
┌─────────────────────────────────────────────────────────────┐
│  UI (React 19, react-router-dom 7)                          │
│  pages/ · components/ · styles/                             │
├─────────────────────────────────────────────────────────────┤
│  State                                                      │
│  · Zustand: sessionStore, realtimeStore  (src/store/zustand/) │
│  · Context: ChatProvider, ProfileProvider, CallProvider     │
├─────────────────────────────────────────────────────────────┤
│  Services                                                   │
│  · api/          REST via api-gateway                       │
│  · realtime/     RealtimeWsClient, useRealtimeChat, sync      │
│  · calls/        WebRTC CallEngine                          │
│  · security/     JWT session, E2EE vault, WebAuthn          │
├─────────────────────────────────────────────────────────────┤
│  Client cache                                               │
│  · cache/idb.ts  Unified IndexedDB (blobs, kv, offline)    │
│  · security/chatVault.ts  Encrypted chat preferences        │
│  · realtime/offlineQueue.ts  Outbound WS queue (IDB-backed) │
├─────────────────────────────────────────────────────────────┤
│  PWA                                                        │
│  · public/sw.js  Service worker (shell + static assets)     │
│  · pwa/registerServiceWorker.ts                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Requirement matrix

| Requirement | Choice | Status | Location |
|-------------|--------|--------|----------|
| React | React 19 | ✅ | `package.json` |
| Next.js | Not required for messenger SPA | 🟡 Phase 2 | Vite today; SSR via Next optional |
| TypeScript | Strict TS | ✅ | `tsconfig.json`, `tsc -b` in build |
| Zustand | Global session + realtime | ✅ | `src/store/zustand/` |
| Redux | Not used | — | Zustand preferred (lighter) |
| WebSocket client | Custom client + hook | ✅ | `realtime/wsClient.ts`, `useRealtimeChat.ts` |
| Service Workers | Shell cache | ✅ | `public/sw.js` |
| IndexedDB cache | Unified `nexa-client` DB | ✅ | `src/cache/idb.ts` |

---

## TypeScript

- Path alias `@/*` → `src/*` (`vite.config.ts`, `tsconfig.json`)
- Build: `tsc -b && vite build` — types must pass before bundle
- Shared domain types: `src/types/`, `src/types/profile.ts`

---

## Zustand stores

| Store | Purpose |
|-------|---------|
| `useSessionStore` | `userId`, `demoMode`, hydration flag (bridge from auth bootstrap) |
| `useRealtimeStore` | `connectionState`, `offlineQueueCount` (bridge from ChatContext / WS) |

**Migration path:** Move `ChatContext` message list + selection into `useChatStore` incrementally; keep Context API until parity tests pass.

---

## WebSocket client

| Piece | Role |
|-------|------|
| `RealtimeWsClient` | Connect, auth frame, heartbeat, send queue, exponential reconnect |
| `useRealtimeChat` | Maps WS + REST sync to UI messages/conversations |
| `sync.ts` | `after_seq` catch-up per conversation |
| `offlineQueue.ts` | Persist pending sends when socket down (IndexedDB) |

Env: `VITE_WS_URL` or same-origin `/api/v1/ws` (Vite proxy → ws-gateway :8009).

---

## IndexedDB (`nexa-client`)

| Store | Content |
|-------|---------|
| `blobs` | Media blob cache by message/attachment id |
| `kv` | JSON key-value (migrations, flags) |
| `offline` | Outbound message queue (`clientMsgId` keyPath) |

Legacy `nexa-media-blobs` migrated on first blob read.

---

## Service Worker

- Registered in production (`registerServiceWorker` from `main.tsx`)
- Dev: off unless `VITE_ENABLE_SW=true`
- **Network-first** for `/api/*` (never cached)
- **Shell fallback** for navigation offline → `index.html`
- **Cache-first** for hashed `/assets/*` after first load

---

## Why Vite instead of Next.js (today)

| Factor | Vite SPA | Next.js |
|--------|----------|---------|
| Messenger UX | Full-screen client, no SEO on `/app/*` | Adds SSR complexity |
| WebSocket | Browser-only, long-lived | Needs careful edge/runtime split |
| Deploy | Static CDN + nginx | Node or static export |

**Recommendation:** Keep **Vite for `/app`**. Add **Next.js** later only for landing, docs, or OG tags if needed.

---

## Dev commands

```bash
cd frontend/web
npm install
npm run dev          # Vite :5173, API proxy :8000, WS :8009
npm run build        # tsc + production bundle
npm run preview      # Test SW + prod assets locally
```

---

See [ARCHITECTURE.md](./ARCHITECTURE.md) · [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) · [PLATFORM_SPEC.md](./PLATFORM_SPEC.md) · [REALTIME.md](./REALTIME.md) · [DEPLOYMENT.md](./DEPLOYMENT.md).
