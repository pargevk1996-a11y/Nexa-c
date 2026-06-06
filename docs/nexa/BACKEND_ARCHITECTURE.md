# Nexa — Backend & infrastructure architecture (production-grade)

> **Runtime:** FastAPI microservices (Python 3.12) — primary stack.  
> **Alternatives:** Go / Node.js for hot paths only when profiling demands (not default).  
> **Orchestration:** Docker Compose (today) → Kubernetes (production target).

**Related:** [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) · [DEPLOYMENT.md](./DEPLOYMENT.md) · [REALTIME.md](./REALTIME.md) · [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) · [WS_PROTOCOL.md](./WS_PROTOCOL.md)

---

## 1. Layer diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Edge: Nginx TLS (443) · CDN (prod) · WAF                               │
├─────────────────────────────────────────────────────────────────────────┤
│  Gateway                                                                │
│  · api-gateway     REST /api/v1/{service}/…  JWT, CSRF, rate limits     │
│  · ws-gateway      WebSocket /api/v1/ws      fan-out, registry          │
├─────────────────────────────────────────────────────────────────────────┤
│  Domain microservices (FastAPI)                                         │
│  auth · user · contact · chat · media · notification · presence · call  │
│  story · emoji · ai (sidecar)                                           │
├─────────────────────────────────────────────────────────────────────────┤
│  Shared library: backend/shared/securechat_shared/                      │
│  JWT · security · realtime bus · Redis cache · schemas                  │
├─────────────────────────────────────────────────────────────────────────┤
│  Data plane                                                             │
│  PostgreSQL (per-service DB) · Redis · object store · message bus       │
├─────────────────────────────────────────────────────────────────────────┤
│  Observability (target)                                                 │
│  Prometheus · Grafana · ELK/Loki · OpenTelemetry traces                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Requirement matrix — backend services

| Service | Requirement | Implementation | Port | Status |
|---------|-------------|----------------|------|--------|
| **API Gateway** | Single REST entry, auth edge | `backend/api-gateway` — proxy, JWT, CSRF | 8000 | ✅ Production path |
| **Auth Service** | Login, 2FA, sessions, OAuth, WebAuthn | `backend/auth-service` | 8001 | ✅ |
| **Chat Service** | Conversations, messages, sync, groups | `backend/chat-service` | 8004 | ✅ (+ in-memory dev store) |
| **Media Service** | Upload, encrypt, signed URLs | `backend/media-service` | 8005 | ✅ (local FS; S3-ready config) |
| **Notification Service** | Push prefs, WebPush/FCM/APNs | `backend/notification-service` | 8008 | 🟡 Stub (health + routes skeleton) |
| **Presence Service** | Online, typing, last seen | `backend/presence-service` | 8010 | ✅ |
| **Call Service** | WebRTC signaling, TURN creds | `backend/call-service` | 8011 | ✅ |
| **WebSocket** | Realtime delivery | `backend/ws-gateway` | 8009 | ✅ |
| User / Contact / Story / Emoji / AI | Supporting domains | respective `backend/*` | 8002–8012 | ✅ / 🟡 stub |

**Gateway routing:** `GET/POST /api/v1/{auth|users|chat|media|presence|calls|notifications|…}/…` → upstream service URL from env (`api-gateway/app/core/config.py`).

**Language choice:**

| Option | Role in Nexa |
|--------|----------------|
| **FastAPI** | Default for all services — async I/O, Pydantic, shared `securechat_shared` |
| **Go** | Optional: ws-gateway or fan-out worker if Python CPU-bound (Phase 6+) |
| **Node.js** | Optional: notification bridge, bot webhooks — only if team standardizes on TS |

---

## 3. Request flows

### 3.1 REST (authenticated)

```
Client → Nginx → api-gateway
              → validate JWT (RS256/HS256)
              → rate limit / CSRF (mutations)
              → HTTP proxy → {service}:800x
              → PostgreSQL (service DB) + Redis (cache/rate)
```

### 3.2 Realtime

```
Client → Nginx → ws-gateway (upgrade)
              → JWT on connect
              → ConnectionRegistry (Redis SET nexa:ws:conns:{user})
chat/presence/call → EventBus.publish_to_users → nexa:ws:node:{node_id}
              → ws-gateway delivers JSON frames (see WS_PROTOCOL.md)
```

Implementation: `securechat_shared/realtime/bus.py`, `registry.py`, `chat-service/.../realtime_publisher.py`.

### 3.3 Media

```
Client → api-gateway → media-service
       → encrypted blob → MEDIA_STORAGE_ROOT (dev) / S3 (prod)
       → metadata → media_db
       → signed URL → CDN edge (prod)
```

---

## 4. Requirement matrix — infrastructure

| Component | Requirement | Current (repo) | Production target |
|-----------|-------------|----------------|-------------------|
| **PostgreSQL** | Durable per-domain data | ✅ Compose `postgres:16`, 8 DBs in `infrastructure/postgres/init/` | RDS/Aurora, PgBouncer, replicas |
| **Redis** | Cache, WS registry, pub/sub | ✅ Compose `redis:7`, `RedisCache`, `EventBus` | Redis Cluster, AOF |
| **Kafka / NATS / RabbitMQ** | Async events, cross-node fan-out | 🟡 Redis pub/sub today; NATS planned | **NATS JetStream** (ADR-003 in MASTER_PLAN) |
| **MinIO / S3** | Object storage for media | 🟡 Local `MEDIA_STORAGE_ROOT`; S3 env-ready | MinIO dev profile / S3 + versioning |
| **Docker** | Local & CI images | ✅ `docker-compose.yml`, per-service Dockerfiles | Buildx bake |
| **Kubernetes** | Prod orchestration | 🟡 Documented in DEPLOYMENT.md | `infrastructure/k8s/` (Phase 6) |
| **Nginx** | TLS termination, routing | ✅ `infrastructure/nginx/` | Ingress + cert-manager |
| **CDN** | Global media/static | 🟡 `MEDIA_CDN_BASE_URL` config | CloudFront / Cloudflare |
| **Prometheus + Grafana** | Metrics | 🟡 Optional Compose profile | ServiceMonitor + dashboards |
| **ELK stack** | Centralized logs | 🟡 Optional Compose profile | Elasticsearch + Kibana or Loki |

**Message bus decision:** Prefer **NATS JetStream** over Kafka for regional chat fan-out (<10k msg/s per shard, lower ops). Kafka reserved for analytics pipelines if needed later.

---

## 5. PostgreSQL layout

| Database | Service | Notes |
|----------|---------|-------|
| `auth_db` | auth-service | users, sessions, 2FA, WebAuthn |
| `user_db` | user-service | profiles, privacy |
| `contact_db` | contact-service | graph, blocks |
| `chat_db` | chat-service | conversations, messages (migrations planned) |
| `media_db` | media-service | upload metadata |
| `notification_db` | notification-service | subscriptions, prefs |
| `story_db` / `emoji_db` | story, emoji | ancillary |

Schema reference: [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md).

---

## 6. Redis keyspace (production patterns)

| Key | Purpose |
|-----|---------|
| `nexa:ws:conns:{user_id}` | SET of `{node_id}:{conn_id}` — multi-device routing |
| `nexa:ws:node:{node_id}` | Pub/sub channel per WS pod |
| `nexa:presence:{user_id}` | Online TTL |
| `nexa:typing:{conv_id}` | Typing indicator set |
| `nexa:rate:{scope}` | Rate limiting |
| `nexa:mq:retry` | WS retry stream |
| `nexa:chat:sync:{conv_id}` | Short TTL sync cache (chat-service) |

---

## 7. Service directory map

```
backend/
├── shared/securechat_shared/   # cross-cutting library
├── api-gateway/                # edge REST
├── ws-gateway/                 # edge WebSocket
├── auth-service/
├── user-service/
├── contact-service/
├── chat-service/
├── media-service/
├── notification-service/
├── presence-service/
├── call-service/
├── story-service/
├── emoji-service/
└── ai-service/
```

Each service: `app/main.py`, `app/api/routes.py`, `app/core/config.py`, `Dockerfile`, `requirements.txt`.

---

## 8. Docker Compose

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Full stack: Postgres, Redis, 14 services, Nginx |
| `docker-compose.prod.yml` | Limits, restart policies, no exposed DB |
| `docker-compose.optional.yml` | Profiles: `messaging`, `objectstore`, `observability`, `logging` |

```bash
make up                    # core stack
make optional-up           # + NATS, MinIO, Prometheus, Grafana, ELK (dev)
make prod-up               # production overlay
```

---

## 9. Kubernetes & CDN (target)

See [DEPLOYMENT.md](./DEPLOYMENT.md) §3–7:

- **HPA** on `ws-gateway`, `api-gateway`, `chat-service`, `media-service`
- **Ingress** → Nginx or cloud LB
- **CDN** in front of signed media URLs only (never cache authenticated API)
- **Secrets:** ExternalSecrets → Vault / cloud SM

---

## 10. Observability (target)

| Signal | Tool | Status |
|--------|------|--------|
| Metrics | Prometheus → Grafana | 🟡 Scrape config in `infrastructure/observability/`; `/metrics` endpoints Phase 5 |
| Logs | JSON stdout → ELK or Loki | 🟡 Optional ELK profile for local |
| Traces | OpenTelemetry | ⬜ Planned |
| Alerts | Grafana + PagerDuty | ⬜ SLOs in DEPLOYMENT.md |

**Required log fields:** `service`, `request_id`, `user_id` (hashed), `latency_ms`.

---

## 11. Security at the edge

- JWT access (RS256 prod / HS256 dev) — `scripts/generate-jwt-keys.sh`
- Refresh rotation + session reuse detection — auth-service
- CSRF on cookie auth — api-gateway middleware
- Internal service secret for chat ↔ ai — `INTERNAL_SERVICE_SECRET`
- Media at-rest encryption — `MEDIA_ENCRYPTION_KEY`

Details: [SECURITY.md](./SECURITY.md), [AUTH.md](./AUTH.md).

---

## 12. Implementation roadmap

| Phase | Backend / infra |
|-------|-----------------|
| **Now** | FastAPI mesh, Postgres, Redis pub/sub, Docker, Nginx |
| **Next** | Alembic migrations, durable chat store, NATS fan-out, MinIO |
| **Prod** | K8s, S3+CDN, Prometheus/Grafana, ELK/Loki, push notifications |
| **Scale** | WS HPA, read replicas, message partitioning, regional NATS |

---

## 13. Quick verification

```bash
make up
make health                    # https://localhost/health
curl -sk https://localhost/api/v1/auth/health
docker compose ps
```

Live WS: connect to `wss://localhost/api/v1/ws` with access token (see [REALTIME.md](./REALTIME.md)).
