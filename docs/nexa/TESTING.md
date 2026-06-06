# Nexa — Testing

> Unit, integration, WebSocket, security, load, and E2E coverage for the Nexa monorepo.

---

## Test pyramid

| Layer | Location | Runner | CI |
|-------|----------|--------|-----|
| **Unit** | `tests/unit/`, `frontend/web/src/**/*.test.ts` | pytest, Vitest | ✅ |
| **Integration** | `tests/integration/` | pytest | ✅ |
| **WebSocket** | `tests/websocket/` | pytest + Starlette TestClient | ✅ |
| **Security** | `tests/security/` | pytest | ✅ |
| **Smoke** | `tests/smoke/` | pytest | ✅ |
| **Load** | `tests/load/locustfile.py` | Locust (manual) | ⬜ scheduled optional |
| **E2E** | `tests/e2e/specs/` | Playwright | ✅ |

Default pytest run **excludes** `load` and `e2e` markers (see `pytest.ini`).

---

## Quick start

```bash
# All Python tests (unit + integration + websocket + security + smoke)
make test

# Full local CI (ruff + pytest + vitest + frontend build + compose validate)
make ci-local

# Browser E2E (builds preview server automatically)
make test-e2e

# Load test (requires running gateway)
make dev-up   # or docker stack
make test-load
```

---

## Pytest markers

```bash
pytest tests/unit -v -m unit
pytest tests/integration -v -m integration
pytest tests/websocket -v -m websocket
pytest tests/security -v -m security
pytest tests/smoke -v -m smoke
```

Environment: `JWT_ACCESS_SECRET` is set in `tests/conftest.py` for consistent auth across services.

---

## WebSocket tests

Protocol tests target `ws-gateway` (`/api/v1/ws`): auth-required first frame, valid JWT `auth.ok` ack, invalid token `AUTH_FAILED`.

See [WS_PROTOCOL.md](./WS_PROTOCOL.md).

---

## Security tests

- Protected routes return `401` without Bearer token
- Weak passwords rejected on register (`PASSWORD_TOO_WEAK`)
- Invalid / wrong-type JWT rejected
- SQL-injection-style login input does not bypass auth

SAST and image scanning run in `.github/workflows/security.yml` (Bandit, Trivy, CodeQL, Gitleaks).

---

## Load tests

[Locust](https://locust.io/) file: `tests/load/locustfile.py`

```bash
GATEWAY_HOST=http://127.0.0.1:8000 locust -f tests/load/locustfile.py
# Or headless:
make test-load
```

---

## E2E tests

Playwright project under `tests/e2e/`. Specs cover guest redirects and login page rendering.

```bash
cd tests/e2e && npm install && npx playwright install chromium && npm test
```

Set `E2E_BASE_URL` to point at a deployed preview; `E2E_SKIP_SERVER=1` if the app is already running.

---

## Frontend unit tests

Vitest in `frontend/web` — run `npm run test` from that directory.

---

## CI

GitHub Actions `ci.yml`:

- `backend-test` — `scripts/run-tests.sh`
- `frontend-unit` — Vitest
- `e2e` — Playwright after frontend build
- `security.yml` — Bandit, Trivy, CodeQL (separate workflow)

---

See [DEVOPS.md](./DEVOPS.md) · [WS_PROTOCOL.md](./WS_PROTOCOL.md) · [SECURITY.md](./SECURITY.md).
