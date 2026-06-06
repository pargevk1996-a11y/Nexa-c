# Nexa — Authentication

## Features

| Feature | API | UI |
|---------|-----|-----|
| Registration | `POST /api/v1/auth/register` | `/register` |
| Login | `POST /api/v1/auth/login` | `/login` |
| Logout | `POST /api/v1/auth/logout` | Settings → Sign out |
| QR login | `POST /auth/qr/start`, `GET /auth/qr/poll`, `POST /auth/qr/approve` | `/login/qr`, Settings → Link device |
| Multi-device / sessions | `GET /auth/sessions`, `DELETE /auth/sessions/{id}` | Settings → Active sessions |
| Session revoke | `DELETE /auth/sessions/{id}`, `POST /auth/sessions/revoke-others` | Per-device Revoke / Sign out all others |
| Change password | `POST /auth/change-password` | Settings → Change password |
| Password reset | `POST /auth/forgot-password`, `POST /auth/reset-password` | `/forgot-password`, `/reset-password` |
| Token refresh | `POST /auth/refresh` (HttpOnly cookie) | Auto on bootstrap + 401 retry |
| 2FA (TOTP) | setup/confirm/disable/status + `POST /auth/login/2fa` | Login + Settings |
| Biometric | `POST /auth/webauthn/register`, login/start+finish | Login + Settings |
| Security status | `GET /auth/me/security` | Settings overview |
| Email verification | `POST /auth/verify-email`, `POST /auth/resend-verification` | `/verify-email` |
| Phone verification | `POST /auth/phone/send-code`, `POST /auth/phone/verify` | Settings |

Dev mode (`APP_ENV != production`) returns verification/reset/SMS codes in API messages for local testing.

## Branding

Set `VITE_BRAND_NAME=Nexa` in `frontend/web/.env` (optional; default is Nexa).
