"""Unit tests for the LiveKit SFU backend: join-token grants + webhook verify.

These exercise the security-critical contract of the SFU integration offline (no
running LiveKit server needed): tokens carry exactly the right room/identity grants,
and forged or tampered webhooks are rejected.
"""

import base64
import hashlib
import json

import jwt
import pytest

API_KEY = "APItestkey"
API_SECRET = "test-livekit-secret-0123456789"


@pytest.fixture
def lk():
    """Configure call-service settings with LiveKit enabled, return the module."""
    from tests.helpers.apps import load_app

    load_app("call-service")  # puts backend/call-service on sys.path
    from app.core.config import settings
    from app.services import livekit_service

    mp = pytest.MonkeyPatch()
    mp.setattr(settings, "livekit_url", "wss://sfu.nexa-c.com")
    mp.setattr(settings, "livekit_api_key", API_KEY)
    mp.setattr(settings, "livekit_api_secret", API_SECRET)
    yield livekit_service
    mp.undo()


def _decode(token: str) -> dict:
    return jwt.decode(token, API_SECRET, algorithms=["HS256"], issuer=API_KEY)


def test_mint_join_token_has_scoped_grants(lk) -> None:
    token, ttl = lk.mint_join_token(room="call-123", identity="user-42", display_name="Alice")
    assert ttl > 0
    claims = _decode(token)
    assert claims["iss"] == API_KEY
    assert claims["sub"] == "user-42"
    assert claims["name"] == "Alice"
    grant = claims["video"]
    assert grant["room"] == "call-123"
    assert grant["roomJoin"] is True
    assert grant["canPublish"] is True
    assert grant["canSubscribe"] is True
    assert claims["exp"] > claims["nbf"]


def test_mint_token_can_restrict_publishing(lk) -> None:
    token, _ = lk.mint_join_token(room="r1", identity="viewer", can_publish=False)
    assert _decode(token)["video"]["canPublish"] is False


def test_mint_disabled_raises(lk) -> None:
    from app.core.config import settings

    mp = pytest.MonkeyPatch()
    mp.setattr(settings, "livekit_api_secret", "")  # break the config
    try:
        assert lk.is_enabled() is False
        with pytest.raises(lk.LiveKitError):
            lk.mint_join_token(room="r", identity="u")
    finally:
        mp.undo()


def _sign_webhook(body: bytes, *, secret: str = API_SECRET, key: str = API_KEY) -> str:
    import time

    sha = base64.b64encode(hashlib.sha256(body).digest()).decode("ascii")
    return jwt.encode(
        {"iss": key, "exp": int(time.time()) + 60, "sha256": sha},
        secret,
        algorithm="HS256",
    )


def test_verify_webhook_accepts_valid(lk) -> None:
    body = json.dumps({"event": "participant_joined", "room": {"name": "call-1"}}).encode()
    token = _sign_webhook(body)
    event = lk.verify_webhook(body=body, auth_header=f"Bearer {token}")
    assert event["event"] == "participant_joined"
    assert event["room"]["name"] == "call-1"


def test_verify_webhook_rejects_tampered_body(lk) -> None:
    body = json.dumps({"event": "room_finished", "room": {"name": "call-1"}}).encode()
    token = _sign_webhook(body)
    tampered = json.dumps({"event": "room_finished", "room": {"name": "EVIL"}}).encode()
    with pytest.raises(lk.LiveKitError):
        lk.verify_webhook(body=tampered, auth_header=f"Bearer {token}")


def test_verify_webhook_rejects_wrong_secret(lk) -> None:
    body = json.dumps({"event": "x"}).encode()
    forged = _sign_webhook(body, secret="attacker-secret")
    with pytest.raises(lk.LiveKitError):
        lk.verify_webhook(body=body, auth_header=f"Bearer {forged}")


def test_verify_webhook_requires_token(lk) -> None:
    with pytest.raises(lk.LiveKitError):
        lk.verify_webhook(body=b"{}", auth_header=None)
