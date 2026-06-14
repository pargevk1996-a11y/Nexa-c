"""Unit tests for Redis-backed feature flags."""

from __future__ import annotations

import pytest
from nexa_shared.features.flags import FeatureFlags, FlagConfig, is_flag_enabled


class FakeRedis:
    """In-memory fake for Redis that supports get/set/delete/keys."""

    def __init__(self):
        self._store: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def set(self, key: str, value: str) -> None:
        self._store[key] = value

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)

    async def keys(self, pattern: str) -> list[str]:
        prefix = pattern.rstrip("*")
        return [k for k in self._store if k.startswith(prefix)]

    async def ping(self) -> bool:
        return True


@pytest.fixture()
def redis():
    return FakeRedis()


@pytest.fixture()
def flags(redis):
    return FeatureFlags(redis)


@pytest.mark.asyncio
async def test_flag_off_by_default(flags):
    result = await is_flag_enabled("nonexistent_flag")
    assert result is False


@pytest.mark.asyncio
async def test_flag_enabled_100pct(flags):
    await flags.set("my_feature", enabled=True, rollout_pct=100)
    assert await is_flag_enabled("my_feature") is True


@pytest.mark.asyncio
async def test_flag_disabled(flags):
    await flags.set("my_feature", enabled=False, rollout_pct=100)
    assert await is_flag_enabled("my_feature") is False


@pytest.mark.asyncio
async def test_flag_zero_pct(flags):
    await flags.set("my_feature", enabled=True, rollout_pct=0)
    assert await is_flag_enabled("my_feature") is False


@pytest.mark.asyncio
async def test_flag_rollout_deterministic(flags):
    await flags.set("partial", enabled=True, rollout_pct=50)
    # Same user always gets same result
    r1 = await is_flag_enabled("partial", user_id="user-abc")
    r2 = await is_flag_enabled("partial", user_id="user-abc")
    assert r1 == r2


@pytest.mark.asyncio
async def test_flag_rollout_varies_by_user(flags):
    await flags.set("partial", enabled=True, rollout_pct=50)
    # With 50%, statistically some will be on, some off over many users
    results = set()
    for i in range(20):
        r = await is_flag_enabled("partial", user_id=f"user-{i:04d}")
        results.add(r)
    # With 20 users at 50%, almost certainly both True and False appear
    assert len(results) == 2, "Expected some users in and some out of 50% rollout"


@pytest.mark.asyncio
async def test_list_all(flags):
    await flags.set("flag_a", enabled=True, rollout_pct=100, description="A")
    await flags.set("flag_b", enabled=False, rollout_pct=0, description="B")
    all_flags = await flags.list_all()
    assert "flag_a" in all_flags
    assert "flag_b" in all_flags
    assert all_flags["flag_a"].enabled is True
    assert all_flags["flag_b"].enabled is False


@pytest.mark.asyncio
async def test_delete_flag(flags):
    await flags.set("temp", enabled=True, rollout_pct=100)
    assert await is_flag_enabled("temp") is True
    await flags.delete("temp")
    assert await is_flag_enabled("temp") is False


@pytest.mark.asyncio
async def test_get_returns_none_for_missing(flags):
    result = await flags.get("does_not_exist")
    assert result is None


@pytest.mark.asyncio
async def test_flag_config_serialization():
    cfg = FlagConfig(enabled=True, rollout_pct=75, description="test")
    raw = cfg.to_json()
    restored = FlagConfig.from_json(raw)
    assert restored.enabled is True
    assert restored.rollout_pct == 75
    assert restored.description == "test"
