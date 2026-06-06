"""Backward-compatible re-exports; auth-service uses login_protection_service."""

from nexa_shared.security.login_protection import (
    LoginProtectionConfig,
    LoginCheckResult,
    check_login_allowed,
    record_login_failure,
    record_login_success,
)

__all__ = [
    "LoginProtectionConfig",
    "LoginCheckResult",
    "check_login_allowed",
    "record_login_failure",
    "record_login_success",
]
