"""Load FastAPI apps from backend microservices for tests."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHARED = ROOT / "backend" / "shared"
BACKEND = ROOT / "backend"


def load_app(service_dir: str):
    """Import exactly one microservice `app` package (avoid cross-service pollution)."""
    svc_path = ROOT / "backend" / service_dir
    # Remove every backend service path so only one `app` package resolves.
    for child in BACKEND.iterdir():
        p = str(child.resolve())
        while p in sys.path:
            sys.path.remove(p)
    shared = str(SHARED.resolve())
    if shared in sys.path:
        sys.path.remove(shared)
    sys.path.insert(0, str(svc_path.resolve()))
    sys.path.insert(1, shared)
    for key in list(sys.modules):
        if key == "app" or key.startswith("app."):
            del sys.modules[key]
    module = importlib.import_module("app.main")
    return module.app
