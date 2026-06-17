"""Admin API for feature flags management.

Endpoints:
    GET    /admin/flags              — list all flags
    GET    /admin/flags/{name}       — get one flag
    PUT    /admin/flags/{name}       — upsert flag
    DELETE /admin/flags/{name}       — delete flag

Access is restricted to requests with a valid internal service secret
(X-Internal-Secret header) or a superuser JWT (future: role check).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from nexa_shared.features.flags import FeatureFlags, FlagConfig
from pydantic import BaseModel, Field
from redis.asyncio import Redis

from app.core.config import settings
from app.middleware.security import _get_redis

router = APIRouter(prefix="/admin/flags", tags=["admin-flags"])


async def _get_flags(redis: Redis | None = Depends(_get_redis)) -> FeatureFlags:
    if redis is None:
        raise HTTPException(status_code=503, detail={"error": {"code": "REDIS_UNAVAILABLE", "message": "Feature flags unavailable"}})
    return FeatureFlags(redis)


def _check_secret(x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret")) -> None:
    expected = settings.internal_service_secret
    if not expected or x_internal_secret != expected:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Admin access required"}})


class FlagBody(BaseModel):
    enabled: bool = True
    rollout_pct: int = Field(default=100, ge=0, le=100)
    description: str = ""


class FlagOut(BaseModel):
    name: str
    enabled: bool
    rollout_pct: int
    description: str


def _out(name: str, cfg: FlagConfig) -> FlagOut:
    return FlagOut(name=name, enabled=cfg.enabled, rollout_pct=cfg.rollout_pct, description=cfg.description)


@router.get("", response_model=list[FlagOut])
async def list_flags(
    flags: FeatureFlags = Depends(_get_flags),
    _auth: None = Depends(_check_secret),
) -> list[FlagOut]:
    all_flags = await flags.list_all()
    return [_out(name, cfg) for name, cfg in sorted(all_flags.items())]


@router.get("/{name}", response_model=FlagOut)
async def get_flag(
    name: str,
    flags: FeatureFlags = Depends(_get_flags),
    _auth: None = Depends(_check_secret),
) -> FlagOut:
    cfg = await flags.get(name)
    if cfg is None:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": f"Flag '{name}' not found"}})
    return _out(name, cfg)


@router.put("/{name}", response_model=FlagOut, status_code=200)
async def upsert_flag(
    name: str,
    body: FlagBody,
    flags: FeatureFlags = Depends(_get_flags),
    _auth: None = Depends(_check_secret),
) -> FlagOut:
    await flags.set(
        name,
        enabled=body.enabled,
        rollout_pct=body.rollout_pct,
        description=body.description,
    )
    return _out(name, FlagConfig(enabled=body.enabled, rollout_pct=body.rollout_pct, description=body.description))


@router.delete("/{name}", status_code=204)
async def delete_flag(
    name: str,
    flags: FeatureFlags = Depends(_get_flags),
    _auth: None = Depends(_check_secret),
) -> Response:
    await flags.delete(name)
    return Response(status_code=204)
