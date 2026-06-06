"""Lightweight suspicious-login scoring (expand with GeoIP in production)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class LoginRiskResult:
    score: int
    flags: list[str]
    block: bool


def assess_login(
    *,
    known_fingerprints: set[str],
    fingerprint: str,
    failed_attempts_recent: int,
    ip_changed: bool,
) -> LoginRiskResult:
    flags: list[str] = []
    score = 0
    if fingerprint not in known_fingerprints and known_fingerprints:
        flags.append("new_device")
        score += 30
    if failed_attempts_recent >= 3:
        flags.append("failed_attempts")
        score += min(50, failed_attempts_recent * 10)
    if ip_changed:
        flags.append("ip_change")
        score += 20
    return LoginRiskResult(score=score, flags=flags, block=score >= 80)
