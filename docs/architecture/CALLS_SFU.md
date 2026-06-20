# NEXA Calls — Architecture & SFU Integration (backend)

Status: **backend slice implemented in `call-service` (working tree, not deployed)**.
Date: 2026-06-19.

## TL;DR — stack decision

The "world-class calling" brief proposed a **Node.js / NestJS** backend. NEXA's
backend is **FastAPI / Python microservices** with an existing `call-service`,
WebRTC signaling via `ws-gateway`, and a deployed **coturn**. Introducing a
parallel NestJS stack would fork the backend and throw away working code.

**Decision: keep the FastAPI stack; integrate LiveKit as the SFU.** LiveKit is
language-agnostic (signed-JWT join tokens + signed webhooks), so the backend's
job is token minting + room-state reconciliation — no Node required. The SFU
server itself runs as its own container (`livekit/livekit-server`).

## Topology — hybrid mesh + SFU

```
1:1 call  (2 participants)         Group call (> 2 participants)
─────────────────────────         ────────────────────────────
A ⇄ B  peer-to-peer (mesh)        A ┐
  · DTLS-SRTP, media never           B ┼─⇄  LiveKit SFU  (one up-stream per
    touches the server                C ┘      publisher, SFU forwards/selects)
  · lowest latency, E2EE-capable    · scales: no N² fan-out
  · ICE via STUN + ephemeral TURN   · simulcast: SFU picks layer per subscriber
```

This mirrors WhatsApp/Signal (P2P for 1:1, SFU for groups) and satisfies the
brief's "❌ no full mesh for groups". `call-service` chooses the mode at call
creation: `mode = "sfu"` when `participants >= SFU_MIN_PARTICIPANTS` **and**
LiveKit is configured, else `mode = "mesh"`. If the SFU is not yet deployed,
group calls **degrade to mesh** instead of hard-failing.

## What this change implements (backend — `call-service`)

| Piece | File |
|------|------|
| LiveKit settings + `livekit_enabled` + `SFU_MIN_PARTICIPANTS` | `app/core/config.py` |
| Scoped JWT join-token minting + signed-webhook verification | `app/services/livekit_service.py` |
| `mode` (mesh/sfu) + SFU participant tracking | `app/services/call_store.py` |
| Mesh/SFU routing at call creation; `mode` in `call.incoming` event | `app/api/routes.py` |
| `POST /calls/{id}/token` — participant-only, room+identity-scoped token | `app/api/routes.py` |
| `POST /livekit/webhook` — signed reconcile (join/leave/finish, auto-end) | `app/api/routes.py` |
| `PyJWT` direct dep | `backend/call-service/requirements.txt` |
| `livekit` SFU container + `LIVEKIT_*` env | `docker-compose.yml`, `docker-compose.prod.yml` |
| Token-grant + webhook-verify unit tests | `tests/unit/test_livekit_token.py` |

Security model: the **SFU trusts only signed tokens**; authorization (is this
user a participant of this call?) is enforced in `call-service`, not the SFU. A
token is bound to one room + one identity with explicit publish/subscribe grants,
so it cannot be replayed into another call. Webhooks are verified by signature
**and** body-hash (rejects forged or replayed-against-different-body payloads).

## Env (set in the server `.env`; keep secrets out of the repo)

```
LIVEKIT_URL=wss://sfu.nexa-c.com      # what the client dials
LIVEKIT_API_KEY=<key>                 # must match livekit container LIVEKIT_KEYS
LIVEKIT_API_SECRET=<secret>           # 32+ bytes; never logged/committed
SFU_MIN_PARTICIPANTS=3
```

## Where the rest of the brief actually lives (NOT backend)

A senior split so expectations are honest — most of the brief is **client** or
**SFU-config/ops**, not application-backend:

- **Client (frontend `CallEngine` / RN):** Unified Plan, transceivers, simulcast
  layers, adaptive bitrate / FPS / resolution ladder (4G→720p, 3G→480p, 2G→audio),
  ICE restart, codec preference (Opus + DTX/FEC/PLC; VP9/AV1 with H.264 fallback),
  echo/noise/gain (WebRTC `getUserMedia` constraints + RNNoise/Krisp), background
  blur, PiP, camera switch, grid/speaker/stage views, raise-hand/reactions over
  the data channel, battery optimization.
- **SFU config:** participant ceilings (100→500 needs LiveKit room limits +
  multi-node + node autoscaling), simulcast layer selection, recording (LiveKit
  Egress → S3), per-region routing.
- **Infra/ops (DevOps):** multi-region coturn (EU / US-East / US-West / Asia),
  LiveKit autoscaling behind ALB, Prometheus scrape of LiveKit + coturn, Grafana
  dashboards (RTT / MOS / loss / jitter / fps / bitrate / CPU), CI/CD.
- **SFU fault tolerance:** node failover/migration is a LiveKit cloud/clustering
  concern; client reconnect-without-drop is LiveKit client SDK behaviour.

## Known limitations / follow-ups

- `call_store` is **in-memory** (pre-existing) — call lifecycle is lost on restart
  and not shared across `call-service` replicas. Persist to Postgres + Redis for
  HA before multi-replica deploy.
- Single LiveKit node (no `--redis-host`). Multi-node needs shared Redis (with the
  stack's Redis password) + node autoscaling.
- E2EE for group calls (insertable streams / SFrame over the SFU) is a separate
  workstream; today group media is DTLS-SRTP to the SFU (server can see media).
  1:1 stays P2P and is the privacy-preserving path.
