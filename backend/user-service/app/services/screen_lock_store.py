"""Account-wide manual screen-lock store.

Holds a single boolean per user: whether the account's screen is manually
locked. The flag is account-scoped, so every device/browser that loads the
account reflects it until the correct PIN is entered on any device.

Starts in-memory; `use_postgres()` is called from the service lifespan to back
it with Postgres so the lock survives restarts and is shared across instances.
"""

from __future__ import annotations

from app.db.models import ScreenLockRow


class ScreenLockStore:
    def __init__(self) -> None:
        self._mem: dict[str, bool] = {}
        self._sm = None  # async_sessionmaker when Postgres-backed

    def use_postgres(self, sm) -> None:
        self._sm = sm

    async def get(self, user_id: str) -> bool:
        if self._sm is None:
            return self._mem.get(user_id, False)
        async with self._sm() as session:
            row = await session.get(ScreenLockRow, user_id)
            return bool(row.locked) if row else False

    async def set(self, user_id: str, locked: bool) -> None:
        if self._sm is None:
            self._mem[user_id] = locked
            return
        async with self._sm() as session:
            row = await session.get(ScreenLockRow, user_id)
            if row is None:
                session.add(ScreenLockRow(user_id=user_id, locked=locked))
            else:
                row.locked = locked
            await session.commit()


screen_lock_store = ScreenLockStore()
