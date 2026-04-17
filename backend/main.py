from __future__ import annotations

from fastapi import FastAPI

app = FastAPI(title="TiefbauX Bootstrap")

try:
    from app.main import app as _real_app
    app = _real_app
except Exception as exc:  # pragma: no cover
    detail = f"{exc.__class__.__name__}: {exc}"

    @app.get("/api/health")
    def health():
        return {"status": "boot_error", "detail": detail}

    @app.get("/{path:path}")
    def boot_error(path: str):
        return {"status": "boot_error", "path": path, "detail": detail}

