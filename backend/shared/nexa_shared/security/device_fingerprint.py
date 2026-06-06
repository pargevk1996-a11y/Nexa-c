"""Stable device fingerprint from request metadata (non-PII hash)."""

from __future__ import annotations

import hashlib

from fastapi import Request


def fingerprint_request(request: Request) -> str:
    ua = (request.headers.get("user-agent") or "")[:256]
    accept_lang = (request.headers.get("accept-language") or "")[:64]
    platform = (request.headers.get("sec-ch-ua-platform") or "")[:64]
    raw = f"{ua}|{accept_lang}|{platform}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]
