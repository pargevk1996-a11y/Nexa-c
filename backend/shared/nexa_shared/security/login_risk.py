"""Lightweight suspicious-login scoring (expand with GeoIP in production).

The scorer turns weak signals into a coarse risk score and maps that score onto
one of three outcomes via *configurable* thresholds:

    score < step_up  ->  allow         (normal sign-in)
    step_up..block   ->  step_up        (soft path: re-prompt 2FA, do NOT block)
    score >= block   ->  block          (hard 403)

Design intent (see Nexa fix-brief #6): a bare IP change must never block a real
user. Mobile users routinely flip Wi-Fi<->LTE inside a live session, so an IP
change alone scores well under the step-up threshold. Only a *combination* of
strong signals (new device + repeated failures) reaches a hard block; medium
risk degrades gracefully to a step-up challenge so retention is not punished by
false positives.
"""

from __future__ import annotations

from dataclasses import dataclass

# Conservative production defaults. Override per-deployment from auth-service
# settings (LOGIN_RISK_STEP_UP_THRESHOLD / LOGIN_RISK_BLOCK_THRESHOLD).
DEFAULT_STEP_UP_THRESHOLD = 50
DEFAULT_BLOCK_THRESHOLD = 100

# Signal weights — kept here so the scoring is auditable in one place.
WEIGHT_NEW_DEVICE = 30
WEIGHT_IP_CHANGE = 20
WEIGHT_FAILED_ATTEMPTS_CAP = 50


@dataclass
class LoginRiskResult:
    score: int
    flags: list[str]
    block: bool
    # Medium risk: allow the sign-in but require a step-up (repeat 2FA) when the
    # account has a second factor available. Never set together with ``block``.
    step_up: bool = False


def assess_login(
    *,
    known_fingerprints: set[str],
    fingerprint: str,
    failed_attempts_recent: int,
    ip_changed: bool,
    step_up_threshold: int = DEFAULT_STEP_UP_THRESHOLD,
    block_threshold: int = DEFAULT_BLOCK_THRESHOLD,
) -> LoginRiskResult:
    flags: list[str] = []
    score = 0
    if fingerprint not in known_fingerprints and known_fingerprints:
        flags.append("new_device")
        score += WEIGHT_NEW_DEVICE
    if failed_attempts_recent >= 3:
        flags.append("failed_attempts")
        score += min(WEIGHT_FAILED_ATTEMPTS_CAP, failed_attempts_recent * 10)
    if ip_changed:
        # An IP change is a weak signal on its own (Wi-Fi<->LTE roaming). It only
        # matters in combination with a stronger signal, so it can never reach
        # the block threshold by itself.
        flags.append("ip_change")
        score += WEIGHT_IP_CHANGE

    block = score >= block_threshold
    step_up = (not block) and score >= step_up_threshold
    return LoginRiskResult(score=score, flags=flags, block=block, step_up=step_up)
