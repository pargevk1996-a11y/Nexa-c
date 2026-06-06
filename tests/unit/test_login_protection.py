"""Unit tests: login protection state machine."""

import pytest
from securechat_shared.security.login_protection import (
    AccountLoginState,
    IpEmailLoginState,
    LoginPhase,
    LoginProtectionConfig,
    check_login_allowed,
    record_login_failure,
    record_login_success,
)

pytestmark = pytest.mark.unit

FAST = LoginProtectionConfig(
    max_attempts_before_lock=3,
    first_lockout_seconds=600,
    retry_lockout_seconds=300,
    max_strikes_before_reset=3,
)


def test_three_failures_trigger_ten_minute_lock() -> None:
    ip = IpEmailLoginState()
    acct = AccountLoginState()
    now = 1_000_000.0
    for _ in range(3):
        ip, acct, _ = record_login_failure(ip, acct, now=now, config=FAST)
    assert ip.phase == LoginPhase.LOCKED
    assert ip.lock_tier == "primary"
    assert ip.locked_until == now + 600
    assert acct.strikes == 1


def test_locked_blocks_even_before_expiry() -> None:
    ip = IpEmailLoginState(
        phase=LoginPhase.LOCKED,
        locked_until=1_000_600.0,
        lock_tier="primary",
    )
    acct = AccountLoginState()
    result = check_login_allowed(ip, acct, now=1_000_100.0, config=FAST)
    assert not result.allowed
    assert result.code == "ACCOUNT_LOCKED"
    assert result.retry_after_seconds == 500


def test_after_primary_lock_expires_grace_allows_one_attempt() -> None:
    ip = IpEmailLoginState(
        phase=LoginPhase.LOCKED,
        locked_until=1_000_600.0,
        lock_tier="primary",
    )
    acct = AccountLoginState()
    result = check_login_allowed(ip, acct, now=1_000_700.0, config=FAST)
    assert result.allowed


def test_grace_failure_triggers_five_minute_lock() -> None:
    ip = IpEmailLoginState(phase=LoginPhase.GRACE)
    acct = AccountLoginState(strikes=1)
    now = 2_000_000.0
    ip, acct, failure = record_login_failure(ip, acct, now=now, config=FAST)
    assert ip.phase == LoginPhase.LOCKED
    assert ip.lock_tier == "retry"
    assert ip.locked_until == now + 300
    assert acct.strikes == 2
    assert failure.retry_after_seconds == 300


def test_three_strikes_require_password_reset() -> None:
    ip = IpEmailLoginState()
    acct = AccountLoginState()
    now = 3_000_000.0
    for _ in range(3):
        for _attempt in range(3):
            ip, acct, _ = record_login_failure(ip, acct, now=now, config=FAST)
        now += 700
        ip = IpEmailLoginState(
            phase=LoginPhase.LOCKED,
            locked_until=now,
            lock_tier="primary",
        )
        now += 1
        ip, acct, _ = record_login_failure(
            IpEmailLoginState(phase=LoginPhase.GRACE),
            acct,
            now=now,
            config=FAST,
        )
        now += 400
    assert acct.requires_password_reset
    blocked = check_login_allowed(ip, acct, now=now, config=FAST)
    assert not blocked.allowed
    assert blocked.code == "PASSWORD_RESET_REQUIRED"


def test_password_reset_required_blocks_even_with_success_path() -> None:
    acct = AccountLoginState(requires_password_reset=True, strikes=3)
    ip, acct_out = record_login_success(IpEmailLoginState(), acct)
    assert acct_out.requires_password_reset
    assert ip.phase == LoginPhase.NORMAL


def test_success_clears_strikes_when_not_locked() -> None:
    ip = IpEmailLoginState(failures=2)
    acct = AccountLoginState(strikes=1)
    ip, acct = record_login_success(ip, acct)
    assert ip.failures == 0
    assert acct.strikes == 0
