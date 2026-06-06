import pytest
from securechat_shared.security.passwords import hash_password, verify_password

pytestmark = pytest.mark.smoke


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("test-password-123!")
    assert verify_password(hashed, "test-password-123!")
    assert not verify_password(hashed, "wrong")
