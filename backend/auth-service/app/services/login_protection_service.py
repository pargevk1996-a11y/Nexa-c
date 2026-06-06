"""Redis-backed login protection (always on; same rules in dev and production)."""

from __future__ import annotations

from redis.asyncio import Redis

from app.core.config import settings
from app.core.redis import get_redis
from nexa_shared.security.login_protection import (
    AccountLoginState,
    IpEmailLoginState,
    LoginCheckResult,
    LoginFailureResult,
    LoginProtectionConfig,
    check_login_allowed,
    clear_account_login_lock,
    record_login_failure,
    record_login_success,
)

_IP_PREFIX = "nexa:auth:login:ip:"
_ACCT_PREFIX = "nexa:auth:login:acct:"
_ACCT_IPS_SUFFIX = ":ips"


def _norm_email(email: str) -> str:
    return email.lower().strip()


def _norm_ip(ip: str | None) -> str:
    return (ip or "unknown").strip() or "unknown"


def _ip_key(email: str, ip: str | None) -> str:
    return f"{_IP_PREFIX}{_norm_ip(ip)}:email:{_norm_email(email)}"


def _acct_key(email: str) -> str:
    return f"{_ACCT_PREFIX}{_norm_email(email)}"


def _acct_ips_key(email: str) -> str:
    return f"{_acct_key(email)}{_ACCT_IPS_SUFFIX}"


def protection_config() -> LoginProtectionConfig:
    return LoginProtectionConfig(
        max_attempts_before_lock=settings.login_max_attempts,
        first_lockout_seconds=settings.login_first_lockout_seconds,
        retry_lockout_seconds=settings.login_retry_lockout_seconds,
        max_strikes_before_reset=settings.login_max_strikes,
    )


class MemoryLoginProtectionStore:
    """In-process store for unit tests."""

    def __init__(self) -> None:
        self._ip: dict[str, str] = {}
        self._acct: dict[str, str] = {}
        self._acct_ips: dict[str, set[str]] = {}

    def reset(self) -> None:
        self._ip.clear()
        self._acct.clear()
        self._acct_ips.clear()

    async def get_ip_state(self, email: str, ip: str | None) -> IpEmailLoginState:
        return IpEmailLoginState.from_json(self._ip.get(_ip_key(email, ip)))

    async def set_ip_state(self, email: str, ip: str | None, state: IpEmailLoginState) -> None:
        key = _ip_key(email, ip)
        self._ip[key] = state.to_json()
        ips_key = _acct_ips_key(email)
        self._acct_ips.setdefault(ips_key, set()).add(_norm_ip(ip))

    async def get_account_state(self, email: str) -> AccountLoginState:
        return AccountLoginState.from_json(self._acct.get(_acct_key(email)))

    async def set_account_state(self, email: str, state: AccountLoginState) -> None:
        self._acct[_acct_key(email)] = state.to_json()

    async def clear_email(self, email: str) -> None:
        ips_key = _acct_ips_key(email)
        for ip in list(self._acct_ips.get(ips_key, set())):
            self._ip.pop(_ip_key(email, ip), None)
        self._acct_ips.pop(ips_key, None)
        self._acct.pop(_acct_key(email), None)


class RedisLoginProtectionStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def get_ip_state(self, email: str, ip: str | None) -> IpEmailLoginState:
        raw = await self._redis.get(_ip_key(email, ip))
        return IpEmailLoginState.from_json(raw)

    async def set_ip_state(self, email: str, ip: str | None, state: IpEmailLoginState) -> None:
        key = _ip_key(email, ip)
        pipe = self._redis.pipeline()
        pipe.set(key, state.to_json())
        pipe.sadd(_acct_ips_key(email), _norm_ip(ip))
        await pipe.execute()

    async def get_account_state(self, email: str) -> AccountLoginState:
        raw = await self._redis.get(_acct_key(email))
        return AccountLoginState.from_json(raw)

    async def set_account_state(self, email: str, state: AccountLoginState) -> None:
        await self._redis.set(_acct_key(email), state.to_json())

    async def clear_email(self, email: str) -> None:
        ips_key = _acct_ips_key(email)
        ips = await self._redis.smembers(ips_key)
        pipe = self._redis.pipeline()
        for ip in ips:
            pipe.delete(_ip_key(email, ip))
        pipe.delete(ips_key)
        pipe.delete(_acct_key(email))
        await pipe.execute()


class LoginProtectionService:
    def __init__(self, store: MemoryLoginProtectionStore | RedisLoginProtectionStore) -> None:
        self._store = store

    async def check(self, email: str, ip: str | None) -> LoginCheckResult:
        cfg = protection_config()
        ip_state = await self._store.get_ip_state(email, ip)
        account = await self._store.get_account_state(email)
        return check_login_allowed(ip_state, account, config=cfg)

    async def record_failure(self, email: str, ip: str | None) -> LoginFailureResult:
        cfg = protection_config()
        ip_state = await self._store.get_ip_state(email, ip)
        account = await self._store.get_account_state(email)
        ip_state, account, result = record_login_failure(ip_state, account, config=cfg)
        await self._store.set_ip_state(email, ip, ip_state)
        await self._store.set_account_state(email, account)
        return result

    async def record_success(self, email: str, ip: str | None) -> None:
        ip_state = await self._store.get_ip_state(email, ip)
        account = await self._store.get_account_state(email)
        ip_state, account = record_login_success(ip_state, account)
        await self._store.set_ip_state(email, ip, ip_state)
        await self._store.set_account_state(email, account)

    async def unlock_after_password_reset(self, email: str) -> None:
        await self._store.clear_email(email)
        await self._store.set_account_state(email, clear_account_login_lock())


_memory_store = MemoryLoginProtectionStore()
_service: LoginProtectionService | None = None
_use_memory = False


def use_memory_login_protection_for_tests() -> LoginProtectionService:
    global _service, _use_memory
    _use_memory = True
    _service = LoginProtectionService(_memory_store)
    return _service


def reset_memory_login_protection() -> None:
    _memory_store.reset()


async def get_login_protection() -> LoginProtectionService:
    global _service, _use_memory
    if _service is not None:
        return _service
    if _use_memory or settings.login_protection_use_memory:
        _service = LoginProtectionService(_memory_store)
        return _service
    redis = await get_redis()
    _service = LoginProtectionService(RedisLoginProtectionStore(redis))
    return _service
