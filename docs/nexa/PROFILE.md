# Nexa — Profile System

## API (`user-service` via `/api/v1/users/…`)

| Endpoint | Description |
|----------|-------------|
| `GET /me` | Full profile + privacy settings |
| `PATCH /me` | Update username, nickname, bio, status, avatars, privacy |
| `GET /{user_id}` | Public profile (privacy-filtered for viewer) |
| `GET /search?q=` | Find users by username, nickname, uid |
| `GET /by-username/{username}` | Public profile by $handle |
| `POST /bootstrap` | Sync profile from auth username after login |
| `DELETE /me/avatar` | Remove photo / animated avatar |
| `POST /presence` | Set online/offline + optional status |

## Fields

- **username** — unique handle (`$username`)
- **nickname** — display name
- **avatar_url** / **animated_avatar_url** / **avatar_kind** — `initial` | `image` | `animated`
- **bio**, **status_text**
- **is_online**, **last_seen_at**
- **verification_badge** — `none` | `verified` | `official` | `bot`
- **privacy** — show last seen, online, bio, status, avatar, search

## UI

- **Edit:** `/app/profile` — username, nickname, bio, status, photo + GIF avatar, online/away, privacy
- **Contacts:** `/app/contacts` — global user search with badges and presence
- **Peer view:** `ProfilePanel`, `ChatHeader` (public profile + privacy filtering)
- **Footer:** left panel links to profile with live presence

Dev: upload uses `media-service`; profile stores URLs in memory until Postgres migration.
