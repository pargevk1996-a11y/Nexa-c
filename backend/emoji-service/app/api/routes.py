from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1")


# ---------------------------------------------------------------------------
# Sticker pack data — static registry (Phase 1: no DB required)
# Replace with a Postgres-backed registry in Phase 2.
# ---------------------------------------------------------------------------

class Sticker(BaseModel):
    id: str
    emoji: str
    url: str          # CDN URL or data-URI for bundled packs
    alt: str


class StickerPack(BaseModel):
    id: str
    name: str
    thumbnail: str    # URL of representative sticker
    stickers: list[Sticker]


_PACKS: list[StickerPack] = [
    StickerPack(
        id="nexa-classic",
        name="Nexa Classic",
        thumbnail="https://cdn.nexa.app/stickers/classic/wave.webp",
        stickers=[
            Sticker(id="nc-wave",     emoji="👋", url="https://cdn.nexa.app/stickers/classic/wave.webp",     alt="Wave"),
            Sticker(id="nc-heart",    emoji="❤️", url="https://cdn.nexa.app/stickers/classic/heart.webp",    alt="Heart"),
            Sticker(id="nc-thumbsup", emoji="👍", url="https://cdn.nexa.app/stickers/classic/thumbsup.webp", alt="Thumbs Up"),
            Sticker(id="nc-laugh",    emoji="😂", url="https://cdn.nexa.app/stickers/classic/laugh.webp",    alt="Laugh"),
            Sticker(id="nc-think",    emoji="🤔", url="https://cdn.nexa.app/stickers/classic/think.webp",    alt="Thinking"),
            Sticker(id="nc-fire",     emoji="🔥", url="https://cdn.nexa.app/stickers/classic/fire.webp",     alt="Fire"),
        ],
    ),
    StickerPack(
        id="nexa-secure",
        name="Nexa Secure",
        thumbnail="https://cdn.nexa.app/stickers/secure/lock.webp",
        stickers=[
            Sticker(id="ns-lock",    emoji="🔒", url="https://cdn.nexa.app/stickers/secure/lock.webp",    alt="Lock"),
            Sticker(id="ns-shield",  emoji="🛡️", url="https://cdn.nexa.app/stickers/secure/shield.webp",  alt="Shield"),
            Sticker(id="ns-key",     emoji="🔑", url="https://cdn.nexa.app/stickers/secure/key.webp",     alt="Key"),
            Sticker(id="ns-private", emoji="🕵️", url="https://cdn.nexa.app/stickers/secure/private.webp", alt="Private"),
        ],
    ),
]

_PACK_INDEX: dict[str, StickerPack] = {p.id: p for p in _PACKS}


class StickerPackSummary(BaseModel):
    id: str
    name: str
    thumbnail: str
    count: int


@router.get("/stickers/packs", response_model=list[StickerPackSummary])
async def list_packs() -> list[StickerPackSummary]:
    return [
        StickerPackSummary(id=p.id, name=p.name, thumbnail=p.thumbnail, count=len(p.stickers))
        for p in _PACKS
    ]


@router.get("/stickers/packs/{pack_id}", response_model=StickerPack)
async def get_pack(pack_id: str) -> StickerPack:
    pack = _PACK_INDEX.get(pack_id)
    if pack is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": f"Sticker pack '{pack_id}' not found"}},
        )
    return pack


@router.get("/stickers/{sticker_id}", response_model=Sticker)
async def get_sticker(sticker_id: str) -> Sticker:
    for pack in _PACKS:
        for sticker in pack.stickers:
            if sticker.id == sticker_id:
                return sticker
    raise HTTPException(
        status_code=404,
        detail={"error": {"code": "NOT_FOUND", "message": f"Sticker '{sticker_id}' not found"}},
    )
