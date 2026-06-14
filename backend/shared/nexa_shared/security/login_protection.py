"""Login attempt limits: IP cooldowns and account lock until password reset."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from enum import Enum
from time import time
from typing import Literal


class LoginPhase(str, Enum):
    NORMAL = "normal"
    GRACE = "grace"
    LOCKED = "locked"


LockTier = Literal["primary", "retry"]


@dataclass(frozen=True)
class LoginProtectionConfig:
    max_attempts_before_lock: int = 3
    first_lockout_seconds: int = 600
    retry_lockout_seconds: int = 300
    max_strikes_before_reset: int = 3


@dataclass
class IpEmailLoginState:
    phase: LoginPhase = LoginPhase.NORMAL
    failures: int = 0
    locked_until: float | None = None
    lock_tier: LockTier | None = None

    def to_json(self) -> str:
        payload = asdict(self)
        payload["phase"] = self.phase.value
        return json.dumps(payload)

    @classmethod
    def from_json(cls, raw: str | None) -> IpEmailLoginState:
        if not raw:
            return cls()
        data = json.loads(raw)
        return cls(
            phase=LoginPhase(data.get("phase", LoginPhase.NORMAL.value)),
            failures=int(data.get("failures", 0)),
            locked_until=data.get("locked_until"),
            lock_tier=data.get("lock_tier"),
        )


@dataclass
class AccountLoginState:
    strikes: int = 0
    requires_password_reset: bool = False

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str | None) -> AccountLoginState:
        if not raw:
            return cls()
        data = json.loads(raw)
        return cls(
            strikes=int(data.get("strikes", 0)),
            requires_password_reset=bool(data.get("requires_password_reset", False)),
        )


@dataclass(frozen=True)
class LoginCheckResult:
    allowed: bool
    code: str | None = None
    message: str | None = None
    retry_after_seconds: int | None = None


@dataclass(frozen=True)
class LoginFailureResult:
    failures: int
    strikes: int
    requires_password_reset: bool
    locked: bool
    retry_after_seconds: int | None = None


def _seconds_until(ts: float | None, now: float) -> int:
    if ts is None:
        return 0
    return max(0, int(ts - now))


def _format_wait(seconds: int) -> str:
    if seconds <= 0:
        return "a moment"
    minutes = max(1, (seconds + 59) // 60)
    if minutes == 1:
        return "1 minute"
    return f"{minutes} minutes"


def advance_ip_state(state: IpEmailLoginState, *, now: float, config: LoginProtectionConfig) -> IpEmailLoginState:
    if state.phase != LoginPhase.LOCKED or state.locked_until is None:
        return state
    if now < state.locked_until:
        return state
    if state.lock_tier == "primary":
        return IpEmailLoginState(phase=LoginPhase.GRACE, failures=0, locked_until=None, lock_tier=None)
    return IpEmailLoginState(phase=LoginPhase.NORMAL, failures=0, locked_until=None, lock_tier=None)


def check_login_allowed(
    ip_state: IpEmailLoginState,
    account: AccountLoginState,
    *,
    now: float | None = None,
    config: LoginProtectionConfig | None = None,
) -> LoginCheckResult:
    cfg = config or LoginProtectionConfig()
    now_ts = now if now is not None else time()
    ip_state = advance_ip_state(ip_state, now=now_ts, config=cfg)

    if account.requires_password_reset:
        return LoginCheckResult(
            allowed=False,
            code="PASSWORD_RESET_REQUIRED",
            message="This account is locked. Reset your password to sign in again.",
        )

    if ip_state.phase == LoginPhase.LOCKED and ip_state.locked_until and now_ts < ip_state.locked_until:
        wait = _seconds_until(ip_state.locked_until, now_ts)
        return LoginCheckResult(
            allowed=False,
            code="ACCOUNT_LOCKED",
            message=f"Too many failed attempts. Try again in {_format_wait(wait)}.",
            retry_after_seconds=wait,
        )

    return LoginCheckResult(allowed=True)


def record_login_failure(
    ip_state: IpEmailLoginState,
    account: AccountLoginState,
    *,
    now: float | None = None,
    config: LoginProtectionConfig | None = None,
) -> tuple[IpEmailLoginState, AccountLoginState, LoginFailureResult]:
    cfg = config or LoginProtectionConfig()
    now_ts = now if now is not None else time()
    ip_state = advance_ip_state(ip_state, now=now_ts, config=cfg)

    if account.requires_password_reset:
        return (
            ip_state,
            account,
            LoginFailureResult(
                failures=ip_state.failures,
                strikes=account.strikes,
                requires_password_reset=True,
                locked=True,
            ),
        )

    retry_after: int | None = None

    if ip_state.phase == LoginPhase.GRACE:
        ip_state = IpEmailLoginState(
            phase=LoginPhase.LOCKED,
            failures=0,
            locked_until=now_ts + cfg.retry_lockout_seconds,
            lock_tier="retry",
        )
        account.strikes += 1
        retry_after = cfg.retry_lockout_seconds
    else:
        ip_state.failures += 1
        if ip_state.failures >= cfg.max_attempts_before_lock:
            ip_state = IpEmailLoginState(
                phase=LoginPhase.LOCKED,
                failures=0,
                locked_until=now_ts + cfg.first_lockout_seconds,
                lock_tier="primary",
            )
            account.strikes += 1
            retry_after = cfg.first_lockout_seconds

    if account.strikes >= cfg.max_strikes_before_reset:
        account.requires_password_reset = True

    locked = ip_state.phase == LoginPhase.LOCKED or account.requires_password_reset
    return (
        ip_state,
        account,
        LoginFailureResult(
            failures=ip_state.failures,
            strikes=account.strikes,
            requires_password_reset=account.requires_password_reset,
            locked=locked,
            retry_after_seconds=retry_after,
        ),
    )


def record_login_success(
    ip_state: IpEmailLoginState,
    account: AccountLoginState,
) -> tuple[IpEmailLoginState, AccountLoginState]:
    if account.requires_password_reset:
        return ip_state, account
    return IpEmailLoginState(), AccountLoginState(strikes=0, requires_password_reset=False)


def clear_account_login_lock() -> AccountLoginState:
    return AccountLoginState(strikes=0, requires_password_reset=False)
