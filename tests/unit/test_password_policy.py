"""Unit tests: password policy validation."""

import pytest
from securechat_shared.security.password_policy import (
    VIOLATION_MISSING_DIGIT,
    VIOLATION_TOO_SHORT,
    PasswordPolicy,
    validate_password,
)

pytestmark = pytest.mark.unit


def test_valid_password_empty_violations() -> None:
    policy = PasswordPolicy(min_length=8)
    assert validate_password("anything", policy) == []
    assert validate_password("!!!!!!!!", policy) == []


def test_weak_password_reports_violations() -> None:
    errors = validate_password("short", PasswordPolicy(min_length=8))
    assert VIOLATION_TOO_SHORT in errors


def test_missing_digit_when_required() -> None:
    errors = validate_password("NoDigitsHere!", PasswordPolicy(require_digit=True))
    assert VIOLATION_MISSING_DIGIT in errors
