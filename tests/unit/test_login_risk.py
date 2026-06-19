"""Unit tests for suspicious-login scoring (fix-brief #6).

Core guarantee: a bare IP change (mobile Wi-Fi<->LTE roaming) never blocks and
never even forces a step-up — only a combination of strong signals escalates,
and medium risk degrades to a soft step-up rather than a hard block.
"""

from nexa_shared.security.login_risk import (
    DEFAULT_BLOCK_THRESHOLD,
    DEFAULT_STEP_UP_THRESHOLD,
    assess_login,
)

KNOWN = {"fp-known-device"}


def test_ip_change_alone_does_not_block_or_step_up() -> None:
    # Same trusted device, IP flipped (Wi-Fi -> LTE) — the false-positive that
    # used to punish mobile users.
    result = assess_login(
        known_fingerprints=KNOWN,
        fingerprint="fp-known-device",
        failed_attempts_recent=0,
        ip_changed=True,
    )
    assert result.flags == ["ip_change"]
    assert result.block is False
    assert result.step_up is False


def test_first_ever_login_is_not_flagged_as_new_device() -> None:
    # No known fingerprints yet => first device, nothing to compare against.
    result = assess_login(
        known_fingerprints=set(),
        fingerprint="fp-first",
        failed_attempts_recent=0,
        ip_changed=False,
    )
    assert result.score == 0
    assert result.block is False
    assert result.step_up is False


def test_new_device_plus_ip_change_steps_up_not_blocks() -> None:
    result = assess_login(
        known_fingerprints=KNOWN,
        fingerprint="fp-brand-new",
        failed_attempts_recent=0,
        ip_changed=True,
    )
    assert "new_device" in result.flags and "ip_change" in result.flags
    assert result.score == DEFAULT_STEP_UP_THRESHOLD  # 30 + 20
    assert result.step_up is True
    assert result.block is False


def test_strong_combination_hard_blocks() -> None:
    # New device + brute-forced failures + IP change reaches the block threshold.
    result = assess_login(
        known_fingerprints=KNOWN,
        fingerprint="fp-brand-new",
        failed_attempts_recent=5,
        ip_changed=True,
    )
    assert result.score >= DEFAULT_BLOCK_THRESHOLD
    assert result.block is True
    assert result.step_up is False  # block and step_up are mutually exclusive


def test_thresholds_are_configurable() -> None:
    # A deployment can tighten the policy: a lone IP change blocks if asked to.
    strict = assess_login(
        known_fingerprints=KNOWN,
        fingerprint="fp-known-device",
        failed_attempts_recent=0,
        ip_changed=True,
        step_up_threshold=10,
        block_threshold=15,
    )
    assert strict.block is True

    # ...or loosen it so the same medium signal is allowed through silently.
    lenient = assess_login(
        known_fingerprints=KNOWN,
        fingerprint="fp-brand-new",
        failed_attempts_recent=0,
        ip_changed=True,
        step_up_threshold=999,
        block_threshold=1000,
    )
    assert lenient.block is False
    assert lenient.step_up is False
