# Groups, channels & communities

## Space types

| Type | Visibility | Who can post (main timeline) |
|------|------------|------------------------------|
| `private_group` | Invite-only | All members |
| `public_group` | Discover + join | All members |
| `supergroup` | Public, large | All members |
| `channel` | Public broadcast | Admins & moderators only |
| `broadcast` | Public one-way | Admins & moderators only |
| `community` | Public hub | Admins only (use linked channels) |

Channels inside a community set `parent_id` to the community UUID.

## API (`/api/v1/chat/spaces/...`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/spaces/discover?type=` | Public spaces |
| POST | `/spaces` | Create space |
| GET | `/spaces/{id}` | Details + settings |
| GET | `/spaces/by-slug/{slug}` | Resolve public slug |
| POST | `/spaces/{id}/join` | Join public space |
| POST | `/spaces/{id}/leave` | Leave |
| POST | `/spaces/{id}/invite` | Invite users (admin) |
| GET | `/spaces/{id}/members` | Member list |
| PATCH | `/spaces/{id}/members/role` | Promote/demote |
| PATCH | `/spaces/{id}/settings` | Slow mode, anti-spam, verification gate |
| POST | `/spaces/{id}/moderation/ban` | Ban user |
| POST | `/spaces/{id}/moderation/mute` | Timed mute |
| GET | `/spaces/{id}/moderation/log` | Audit log |
| POST | `/spaces/verification/users/{id}` | Platform verified badge |

## Threads

- Post with `thread_root_id` on `POST .../messages` to reply in a thread.
- `GET /messages/{id}/thread` — thread messages.
- `main_timeline=true` on list messages hides thread replies from the main feed.

## Moderation

- **Slow mode** — `settings.slow_mode_seconds` per user send cooldown.
- **Anti-spam** — rate limit (20/min), duplicate detection.
- **Auto moderation** — levels 0–2: keywords, link flood, caps (level 2).
- **RBAC** — `owner` > `admin` > `moderator` > `member`.

## Verification

- `POST /spaces/verification/users/{user_id}` sets global verified flag.
- Spaces with `join_requires_verification` reject unverified joins.
- `verified: true` on create marks an official space (badge in UI).

## Frontend

- **Create space** — sidebar “+ New group or channel” (`CreateSpaceModal`).
- **Admin panel** — `SpaceAdminPanel` (slow mode, ban) when `my_role` is mod+.
