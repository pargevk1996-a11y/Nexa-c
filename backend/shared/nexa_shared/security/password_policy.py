import re
from dataclasses import dataclass

# Plain-language codes returned to clients (mapped to user-facing copy in UI)
VIOLATION_TOO_SHORT = "too_short"
VIOLATION_TOO_LONG = "too_long"
VIOLATION_MISSING_UPPERCASE = "missing_uppercase"
VIOLATION_MISSING_LOWERCASE = "missing_lowercase"
VIOLATION_MISSING_DIGIT = "missing_digit"
VIOLATION_MISSING_SPECIAL = "missing_special"


@dataclass(frozen=True)
class PasswordPolicy:
    min_length: int = 8
    max_length: int = 128
    require_uppercase: bool = False
    require_lowercase: bool = False
    require_digit: bool = False
    require_special: bool = False

    _SPECIAL = re.compile(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?`~]")


def validate_password(password: str, policy: PasswordPolicy | None = None) -> list[str]:
    """Return list of violation codes; empty means valid."""
    p = policy or PasswordPolicy()
    errors: list[str] = []

    if len(password) < p.min_length:
        errors.append(VIOLATION_TOO_SHORT)
    if len(password) > p.max_length:
        errors.append(VIOLATION_TOO_LONG)
    if p.require_uppercase and not any(c.isupper() for c in password):
        errors.append(VIOLATION_MISSING_UPPERCASE)
    if p.require_lowercase and not any(c.islower() for c in password):
        errors.append(VIOLATION_MISSING_LOWERCASE)
    if p.require_digit and not any(c.isdigit() for c in password):
        errors.append(VIOLATION_MISSING_DIGIT)
    if p.require_special and not p._SPECIAL.search(password):
        errors.append(VIOLATION_MISSING_SPECIAL)

    return errors
