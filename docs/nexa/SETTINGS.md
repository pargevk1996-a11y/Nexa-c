# Nexa — Settings system

> Unified settings at `/app/settings?section={id}` with sidebar navigation.

---

## Sections

| Section | ID | Features |
|---------|-----|----------|
| **Account** | `account` | Username customization, display name |
| **Privacy** | `privacy` | Read receipts, last seen, profile visibility |
| **Theme & display** | `appearance` | Theme, font size, compact list, stories, shortcuts |
| **Notifications** | `notifications` | Push, desktop, mobile, grouping, quiet hours |
| **Security** | `security` | Password, 2FA, phone, QR link, security overview |
| **Devices** | `devices` | Active sessions (web); passkeys when `VITE_WEBAUTHN_ENABLED` |
| **Session history** | `sessions` | Active sessions, revoke, sign out others |
| **Blocked users** | `blocked` | Block / unblock by user ID |
| **Data export** | `data` | Server JSON + local vault export |
| **Delete account** | `danger` | Password + DELETE confirmation |

---

## Storage

| Layer | Data |
|-------|------|
| `AppSettings` | Encrypted localStorage per user (`settings.ts`) |
| `user-service` | Profile privacy (`PATCH /users/me`) |
| `notification-service` | Global notification prefs |
| `auth-service` | Sessions, export, delete, WebAuthn |
| `contact-service` | Block list |

---

## API

| Endpoint | Service |
|----------|---------|
| `PATCH /api/v1/users/me` | Username, privacy |
| `GET/PUT /api/v1/notifications/preferences` | Notifications |
| `GET /api/v1/auth/sessions` | Session history |
| `GET /api/v1/auth/webauthn/credentials` | Devices |
| `GET /api/v1/auth/account/export` | Data export |
| `POST /api/v1/auth/account/delete` | Account deletion |
| `GET/POST/DELETE /api/v1/contacts/blocks` | Blocked users |

---

## Frontend structure

```
frontend/web/src/settings/
  SettingsLayout.tsx
  types.ts
  sections/
    AccountSettingsSection.tsx
    PrivacySettingsSection.tsx
    ...
```

---

See [PROFILE.md](./PROFILE.md) · [NOTIFICATIONS.md](./NOTIFICATIONS.md) · [AUTH.md](./AUTH.md).
