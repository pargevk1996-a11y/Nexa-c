import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.schemas.auth import AuthResponse, OAuthExchangeRequest, UserResponse
from app.api.session_routes import _set_refresh_cookie
from app.services.token_service import issue_tokens_for_user
from app.services.user_store import store

router = APIRouter(prefix="/api/v1", tags=["oauth"])

SUPPORTED_PROVIDERS = frozenset({"google", "github"})

# One-time codes for SPA session exchange after provider redirect
_exchange_codes: dict[str, UserResponse] = {}


def _to_user_response(user) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        uid=user.uid,
    )


def _frontend_callback_url(params: dict[str, str]) -> str:
    base = settings.frontend_url.rstrip("/")
    query = urlencode(params)
    return f"{base}/oauth/callback?{query}"


def _provider_client_id(provider: str) -> str | None:
    if provider == "google":
        return settings.google_client_id or None
    if provider == "github":
        return settings.github_client_id or None
    return None


def _oauth_redirect_uri(provider: str) -> str:
    base = settings.oauth_public_base_url.rstrip("/")
    return f"{base}/api/v1/auth/oauth/{provider}/callback"


def _oauth_disabled_redirect(provider: str) -> RedirectResponse:
    return RedirectResponse(
        _frontend_callback_url({"error": "oauth_disabled", "provider": provider}),
        status_code=302,
    )


@router.get("/oauth/{provider}/start")
async def oauth_start(provider: str) -> RedirectResponse:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=404, detail={"error": {"code": "UNKNOWN_PROVIDER", "message": "Unknown provider"}})

    if not settings.oauth_enabled:
        return _oauth_disabled_redirect(provider)

    client_id = _provider_client_id(provider)
    state = secrets.token_urlsafe(24)

    if not client_id:
        return RedirectResponse(
            _frontend_callback_url({"error": "oauth_not_configured", "provider": provider}),
            status_code=302,
        )

    redirect_uri = _oauth_redirect_uri(provider)
    if provider == "google":
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "online",
            "prompt": "select_account",
        }
        url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
        return RedirectResponse(url, status_code=302)

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "read:user user:email",
        "state": state,
    }
    url = f"https://github.com/login/oauth/authorize?{urlencode(params)}"
    return RedirectResponse(url, status_code=302)


async def _fetch_github_user(access_token: str) -> tuple[str, str, str]:
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        user_res = await client.get("https://api.github.com/user", headers=headers)
        user_res.raise_for_status()
        data = user_res.json()
        email = data.get("email")
        if not email:
            email_res = await client.get("https://api.github.com/user/emails", headers=headers)
            email_res.raise_for_status()
            emails = email_res.json()
            primary = next((e for e in emails if e.get("primary")), None)
            email = (primary or emails[0] if emails else {}).get("address", "")
        username = data.get("login") or "github_user"
        return str(data.get("id", username)), email or f"{username}@users.noreply.github.com", username


async def _fetch_google_user(access_token: str) -> tuple[str, str, str]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        res.raise_for_status()
        data = res.json()
        sub = str(data.get("sub", "google_user"))
        email = data.get("email") or f"{sub}@google.oauth"
        name = data.get("name") or email.split("@")[0]
        return sub, email, name


async def _exchange_code(provider: str, code: str) -> tuple[str, str, str]:
    redirect_uri = _oauth_redirect_uri(provider)
    if provider == "google":
        secret = settings.google_client_secret
        if not secret:
            raise HTTPException(status_code=501, detail={"error": {"code": "OAUTH_NOT_CONFIGURED", "message": "Google OAuth is not configured"}})
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_res = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            if token_res.is_error:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": {
                            "code": "OAUTH_TOKEN_FAILED",
                            "message": "Google token exchange failed. Check redirect URI and client secret.",
                        }
                    },
                )
            access_token = token_res.json().get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail={"error": {"code": "OAUTH_FAILED", "message": "Could not obtain access token"}})
        return await _fetch_google_user(access_token)

    secret = settings.github_client_secret
    if not secret:
        raise HTTPException(status_code=501, detail={"error": {"code": "OAUTH_NOT_CONFIGURED", "message": "GitHub OAuth is not configured"}})
    async with httpx.AsyncClient(timeout=15.0) as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )
        token_res.raise_for_status()
        access_token = token_res.json().get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail={"error": {"code": "OAUTH_FAILED", "message": "Could not obtain access token"}})
    return await _fetch_github_user(access_token)


@router.get("/oauth/{provider}/callback")
async def oauth_provider_callback(
    provider: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=404, detail={"error": {"code": "UNKNOWN_PROVIDER", "message": "Unknown provider"}})

    if not settings.oauth_enabled:
        return _oauth_disabled_redirect(provider)

    if error:
        return RedirectResponse(
            _frontend_callback_url({"error": error, "provider": provider}),
            status_code=302,
        )

    if not code:
        return RedirectResponse(
            _frontend_callback_url({"error": "missing_code", "provider": provider}),
            status_code=302,
        )

    try:
        subject, email, username = await _exchange_code(provider, code)
    except HTTPException as exc:
        err_code = "oauth_failed"
        if isinstance(exc.detail, dict):
            err = exc.detail.get("error", {})
            if isinstance(err, dict) and err.get("code"):
                err_code = str(err["code"]).lower()
        return RedirectResponse(
            _frontend_callback_url({"error": err_code, "provider": provider}),
            status_code=302,
        )
    except Exception:
        return RedirectResponse(
            _frontend_callback_url({"error": "oauth_failed", "provider": provider}),
            status_code=302,
        )

    user = await store.get_or_create_oauth_user(provider, subject, email, username)
    exchange = secrets.token_urlsafe(32)
    _exchange_codes[exchange] = _to_user_response(user)
    return RedirectResponse(
        _frontend_callback_url({"exchange": exchange, "provider": provider, "state": state or ""}),
        status_code=302,
    )


@router.post("/oauth/exchange", response_model=AuthResponse)
async def oauth_exchange(
    body: OAuthExchangeRequest,
    request: Request,
    response: Response,
) -> AuthResponse:
    if not settings.oauth_enabled:
        raise HTTPException(
            status_code=503,
            detail={"error": {"code": "OAUTH_DISABLED", "message": "OAuth sign-in is temporarily disabled."}},
        )
    user_resp = _exchange_codes.pop(body.exchange, None)
    if not user_resp:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "INVALID_EXCHANGE", "message": "Sign-in link expired. Please try again."}},
        )
    stored = await store.get_by_id(user_resp.id)
    if not stored:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "USER_NOT_FOUND", "message": "User not found"}},
        )
    access, raw_refresh, _, ttl = await issue_tokens_for_user(
        stored.id,
        stored.email,
        device_label="OAuth",
        request=request,
    )
    _set_refresh_cookie(response, raw_refresh)
    return AuthResponse(user=user_resp, access_token=access, expires_in=ttl)
