from typing import Literal

SameSite = Literal["lax", "strict", "none"]


def cookie_params(
    *,
    secure: bool,
    samesite: SameSite = "lax",
    domain: str | None = None,
    max_age: int | None = None,
) -> dict[str, str | int | bool]:
    params: dict[str, str | int | bool] = {
        "httponly": True,
        "secure": secure,
        "samesite": samesite,
    }
    if domain:
        params["domain"] = domain
    if max_age is not None:
        params["max_age"] = max_age
    return params
