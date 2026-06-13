"""Shared pytest fixtures and PYTHONPATH for microservice tests."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / "backend" / "shared"

for path in (SHARED,):
    s = str(path)
    if s not in sys.path:
        sys.path.insert(0, s)

# Consistent JWT secret across services under test
os.environ.setdefault("JWT_ACCESS_SECRET", "test-jwt-secret-for-pytest-only")
os.environ.setdefault("JWT_ALGORITHM", "HS256")


@pytest.fixture
def test_jwt_secret() -> str:
    return os.environ["JWT_ACCESS_SECRET"]


@pytest.fixture
def auth_client() -> TestClient:
    os.environ["LOGIN_PROTECTION_USE_MEMORY"] = "true"
    from tests.helpers.apps import load_app

    app = load_app("auth-service")
    from app.services.user_store import store as user_store
    from app.services.session_store import session_store
    from app.services.login_protection_service import (
        reset_memory_login_protection,
        use_memory_login_protection_for_tests,
    )

    use_memory_login_protection_for_tests()
    reset_memory_login_protection()

    from app.api import auth_routes
    from app.core.config import settings as auth_settings
    from nexa_shared.security.password_policy import PasswordPolicy

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(auth_settings, "password_require_uppercase", False)
    monkeypatch.setattr(auth_settings, "password_require_lowercase", False)
    monkeypatch.setattr(auth_settings, "password_require_digit", False)
    monkeypatch.setattr(auth_settings, "password_require_special", False)
    monkeypatch.setattr(
        auth_routes,
        "_POLICY",
        PasswordPolicy(min_length=8),
    )

    user_store._impl._by_email.clear()
    user_store._impl._by_id.clear()
    session_store._impl._sessions.clear()
    session_store._impl._by_refresh_hash.clear()
    session_store._impl._qr.clear()

    with TestClient(app) as client:
        yield client
    monkeypatch.undo()
    reset_memory_login_protection()


@pytest.fixture
def contact_client() -> TestClient:
    from tests.helpers.apps import load_app

    app = load_app("contact-service")
    from app.services.block_store import block_store

    block_store._blocks.clear()

    with TestClient(app) as client:
        yield client


@pytest.fixture
def ws_client() -> TestClient:
    from tests.helpers.apps import load_app

    app = load_app("ws-gateway")
    with TestClient(app) as client:
        yield client


