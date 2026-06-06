# Nexa — Notifications

> Push, desktop, mobile, silent messages, grouping, and smart mute.

---

## Channels

| Channel | Platform | Implementation |
|---------|----------|----------------|
| **Desktop** | Browser tab background | `Notification` API + grouping (`NotificationCenter.ts`) |
| **Mobile** | iOS/Android web | Web Push → SW `push` event; native FCM/APNs via subscription |
| **Push** | All (background) | `notification-service` outbox → WebPush / FCM / APNs (stubs + outbox) |
| **Silent** | Sender opt-out | `silent` on message + `Notification.silent` / payload flag |

---

## Backend (`notification-service` :8008)

| Endpoint | Purpose |
|----------|---------|
| `GET/PUT /api/v1/notifications/preferences` | Global prefs |
| `GET/PUT /api/v1/notifications/preferences/{conversation_id}` | Per-chat prefs |
| `POST /api/v1/notifications/subscriptions` | Register web/fcm/apns/desktop |
| `POST /api/v1/notifications/internal/dispatch` | Internal (chat-service) |

**Smart mute** (`mute_engine.py`):

- `mute_all` / `mute_until` — block unless mentions-only
- `mentions_only` — allow @mentions while muted
- `quiet_hours_start` / `quiet_hours_end` — suppress outside mentions
- Channel flags: `push_enabled`, `desktop_enabled`, `mobile_enabled`

**Grouping** (`grouping.py`):

- Collapse key: `nexa:conv:{conversation_id}`
- Title: `{chat} (N new)` when count > 1

**Flow:** `chat-service` → `dispatch_push_for_message()` after `message.new` WS publish.

---

## Frontend

| Module | Role |
|--------|------|
| `notifications/NotificationCenter.ts` | Desktop/mobile delivery, sound, grouping |
| `notifications/smartMute.ts` | Client-side mute evaluation |
| `notifications/grouping.ts` | 2.2s debounce per conversation |
| `hooks/useNotificationPrefs.ts` | Sync prefs with API |
| `api/notifications.ts` | REST client |

**Settings** (`/app/settings`): desktop, push, mobile, grouping, smart mute, quiet hours.

**Per-chat** (`ProfilePanel` → Alerts): mute, mentions-only, preview.

**Silent send:** Composer 🔕 → `SendOptions.silent` → API `silent: true`.

---

## Database

`infrastructure/postgres/migrations/notification_db/001_schema.sql`

---

## Configuration

| Env | Service |
|-----|---------|
| `NOTIFICATION_SERVICE_URL` | chat-service |
| `INTERNAL_SERVICE_SECRET` | chat ↔ notification internal dispatch |
| `VITE_VAPID_PUBLIC_KEY` | Web Push (optional) |

---

## Verify

1. `make up` — enable desktop notifications in Settings.
2. Demo login → background tab → wait for demo message → grouped desktop alert.
3. Composer 🔕 → send → silent badge, no sound.
4. Profile → Alerts → mute chat → no alerts (unless mentions-only + @you).
5. Live: two users, `POST` message → check `notification-service` logs / `GET .../outbox`.

See [REALTIME.md](./REALTIME.md) · [FEATURES.md](./FEATURES.md).
