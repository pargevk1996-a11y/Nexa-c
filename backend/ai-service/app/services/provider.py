"""AI provider — OpenAI-compatible API with heuristic fallback."""

from __future__ import annotations

import base64
import json
import re
from typing import Any

import httpx
from app.core.config import settings

_SPAM_PATTERNS = (
    r"free money",
    r"click here",
    r"crypto giveaway",
    r"buy now",
    r"limited offer",
    r"telegram\.me/join",
    r"whatsapp",
)
_TOXIC_PATTERNS = (
    r"\b(kill|die|hate you)\b",
    r"\b(idiot|stupid|moron)\b",
)


class AiProvider:
    provider_name: str = "mock"

    async def chat(self, messages: list[dict[str, str]]) -> str:
        raise NotImplementedError

    async def smart_reply(self, recent: list[dict[str, str]]) -> list[str]:
        raise NotImplementedError

    async def transcribe(self, audio_base64: str, audio_format: str, language: str | None) -> tuple[str, str | None]:
        raise NotImplementedError

    async def translate(self, text: str, source_lang: str | None, target_lang: str) -> tuple[str, str | None]:
        raise NotImplementedError

    async def moderate(self, text: str, context: str | None) -> dict[str, Any]:
        raise NotImplementedError

    async def spam_score(self, text: str) -> dict[str, Any]:
        raise NotImplementedError

    async def summarize(self, messages: list[dict[str, str]], max_length: int) -> tuple[str, list[str]]:
        raise NotImplementedError


class MockProvider(AiProvider):
    provider_name = "mock"

    async def chat(self, messages: list[dict[str, str]]) -> str:
        last = messages[-1]["content"] if messages else ""
        if "?" in last:
            return "Good question — I can help summarize the chat, suggest replies, or translate messages."
        return "I'm your Nexa assistant. Ask me to summarize this chat, draft a reply, or explain something."

    async def smart_reply(self, recent: list[dict[str, str]]) -> list[str]:
        last = recent[-1]["text"].lower() if recent else ""
        if "?" in last:
            return ["Sure, let me check.", "Good question!", "I'll get back to you soon."]
        if any(w in last for w in ("thanks", "thank you", "спасибо")):
            return ["You're welcome!", "Anytime!", "Happy to help."]
        if any(w in last for w in ("hello", "hi", "hey", "привет")):
            return ["Hey!", "Hi there!", "Hello!"]
        return ["Sounds good.", "Got it.", "On it."]

    async def transcribe(self, audio_base64: str, audio_format: str, language: str | None) -> tuple[str, str | None]:
        size_kb = len(audio_base64) * 3 // 4 // 1024
        return (
            f"[Voice message ~{max(1, size_kb)}KB — set AI_API_KEY for real transcription]",
            language or "en",
        )

    async def translate(self, text: str, source_lang: str | None, target_lang: str) -> tuple[str, str | None]:
        return (f"[{target_lang}] {text}", source_lang)

    async def moderate(self, text: str, context: str | None) -> dict[str, Any]:
        lower = text.lower()
        toxic = any(re.search(p, lower) for p in _TOXIC_PATTERNS)
        score = 0.85 if toxic else 0.1
        return {
            "allowed": not toxic,
            "score": score,
            "categories": {"toxicity": score, "harassment": score * 0.8},
            "reason": "Heuristic toxicity match" if toxic else None,
        }

    async def spam_score(self, text: str) -> dict[str, Any]:
        lower = text.lower()
        signals: list[str] = []
        score = 0.0
        for p in _SPAM_PATTERNS:
            if re.search(p, lower):
                signals.append(f"pattern:{p}")
                score = max(score, 0.7)
        urls = len(re.findall(r"https?://", lower))
        if urls >= 3:
            signals.append("link_flood")
            score = max(score, 0.75)
        if len(text) > 30 and sum(1 for c in text if c.isupper()) / len(text) > 0.7:
            signals.append("caps_flood")
            score = max(score, 0.6)
        return {"is_spam": score >= settings.ai_spam_block_threshold, "score": score, "signals": signals}

    async def summarize(self, messages: list[dict[str, str]], max_length: int) -> tuple[str, list[str]]:
        texts = [m["text"] for m in messages if m.get("text")][:12]
        joined = " ".join(texts)
        summary = joined[:max_length] + ("…" if len(joined) > max_length else "")
        bullets = [t[:80] + ("…" if len(t) > 80 else "") for t in texts[-3:]]
        return summary or "No messages to summarize.", bullets


class OpenAiProvider(AiProvider):
    provider_name = "openai"

    def __init__(self) -> None:
        self._timeout = settings.ai_request_timeout_seconds

    async def _post(self, path: str, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{settings.ai_base_url.rstrip('/')}/{path.lstrip('/')}",
                headers={"Authorization": f"Bearer {settings.ai_api_key}"},
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def chat(self, messages: list[dict[str, str]]) -> str:
        data = await self._post(
            "chat/completions",
            {
                "model": settings.ai_chat_model,
                "messages": messages,
                "max_tokens": 512,
                "temperature": 0.6,
            },
        )
        return str(data["choices"][0]["message"]["content"]).strip()

    async def smart_reply(self, recent: list[dict[str, str]]) -> list[str]:
        context = "\n".join(f"{m.get('sender', 'user')}: {m['text']}" for m in recent[-8:])
        prompt = (
            "Suggest exactly 3 short reply options (max 8 words each) for the last message. "
            "Return JSON array of strings only.\n\n" + context
        )
        raw = await self.chat([{"role": "user", "content": prompt}])
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(x)[:120] for x in parsed[:3]]
        except json.JSONDecodeError:
            pass
        return [line.strip("-• ") for line in raw.splitlines() if line.strip()][:3]

    async def transcribe(self, audio_base64: str, audio_format: str, language: str | None) -> tuple[str, str | None]:
        audio_bytes = base64.b64decode(audio_base64)
        files = {"file": (f"audio.{audio_format}", audio_bytes, f"audio/{audio_format}")}
        data = {"model": settings.ai_whisper_model}
        if language:
            data["language"] = language
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{settings.ai_base_url.rstrip('/')}/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.ai_api_key}"},
                files=files,
                data=data,
            )
            resp.raise_for_status()
            body = resp.json()
        return str(body.get("text", "")).strip(), language

    async def translate(self, text: str, source_lang: str | None, target_lang: str) -> tuple[str, str | None]:
        src = source_lang or "auto"
        prompt = f"Translate to {target_lang}. Return only the translation.\n\n{text}"
        out = await self.chat([{"role": "user", "content": prompt}])
        return out, src if src != "auto" else None

    async def moderate(self, text: str, context: str | None) -> dict[str, Any]:
        try:
            data = await self._post(
                "moderations",
                {"input": text, "model": "omni-moderation-latest"},
            )
            result = data["results"][0]
            cats = result.get("category_scores", {})
            max_score = max(cats.values()) if cats else 0.0
            flagged = bool(result.get("flagged"))
            return {
                "allowed": not flagged and max_score < settings.ai_moderation_block_threshold,
                "score": float(max_score),
                "categories": {k: float(v) for k, v in cats.items()},
                "reason": "OpenAI moderation flagged" if flagged else None,
            }
        except Exception:
            return await MockProvider().moderate(text, context)

    async def spam_score(self, text: str) -> dict[str, Any]:
        prompt = (
            "Rate spam likelihood 0-1 for this chat message. "
            'Return JSON {"score": number, "signals": string[]} only.\n\n' + text
        )
        try:
            raw = await self.chat([{"role": "user", "content": prompt}])
            parsed = json.loads(raw)
            score = float(parsed.get("score", 0))
            signals = [str(s) for s in parsed.get("signals", [])]
            return {
                "is_spam": score >= settings.ai_spam_block_threshold,
                "score": score,
                "signals": signals,
            }
        except Exception:
            return await MockProvider().spam_score(text)

    async def summarize(self, messages: list[dict[str, str]], max_length: int) -> tuple[str, list[str]]:
        context = "\n".join(f"{m.get('sender', 'user')}: {m['text']}" for m in messages[-40:])
        prompt = (
            f"Summarize this chat in at most {max_length} characters and add up to 5 bullet points. "
            'Return JSON {"summary": "...", "bullet_points": ["..."]}.\n\n' + context
        )
        raw = await self.chat([{"role": "user", "content": prompt}])
        try:
            parsed = json.loads(raw)
            return str(parsed.get("summary", raw))[:max_length], [str(b) for b in parsed.get("bullet_points", [])][:5]
        except json.JSONDecodeError:
            return raw[:max_length], []


def get_provider() -> AiProvider:
    if settings.has_api_key:
        return OpenAiProvider()
    return MockProvider()
