"""Unit tests: contact block store."""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend" / "shared"))
sys.path.insert(0, str(ROOT / "backend" / "contact-service"))

from app.services.block_store import BlockStore

pytestmark = pytest.mark.unit


def test_block_and_list() -> None:
    store = BlockStore()
    rec = store.block("owner-1", "blocked-2", reason="spam")
    assert rec.blocked_user_id == "blocked-2"
    listed = store.list_blocks("owner-1")
    assert len(listed) == 1
    assert store.is_blocked("owner-1", "blocked-2")


def test_self_block_raises() -> None:
    store = BlockStore()
    with pytest.raises(ValueError, match="SELF_BLOCK"):
        store.block("same", "same")


def test_unblock() -> None:
    store = BlockStore()
    store.block("a", "b")
    assert store.unblock("a", "b")
    assert not store.is_blocked("a", "b")
