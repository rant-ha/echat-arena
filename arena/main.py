"""FastAPI application assembly."""

import os
import sys
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from arena.config import (
    APP_VERSION,
    ALLOWED_ORIGINS,
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    ARCHIVE_ENABLED,
    ARCHIVE_INTERVAL_HOURS,
    DRIVE_CREDS_JSON,
    DRIVE_FOLDER_ID,
)
from arena.utils import _utc_now_iso, _json_dumps
from arena.state import get_state
from arena.session import SupabaseSessionStore, SessionStore
from arena.archive import _run_archive_once

from arena.routes import health, config_routes, battle, vote, chat, drafts, sessions
from arena.routes.admin import auth as admin_auth
from arena.routes.admin import models as admin_models
from arena.routes.admin import users as admin_users
from arena.routes.admin import stats as admin_stats
from arena.routes.admin import archive as admin_archive


def create_app() -> FastAPI:
    application = FastAPI(title="Empathy Arena API", version=APP_VERSION)

    # CORS
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*" if o == "*" else o for o in ALLOWED_ORIGINS] or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include all routers
    application.include_router(health.router)
    application.include_router(config_routes.router)
    application.include_router(battle.router)
    application.include_router(vote.router)
    application.include_router(chat.router)
    application.include_router(drafts.router)
    application.include_router(sessions.router)
    application.include_router(admin_auth.router)
    application.include_router(admin_models.router)
    application.include_router(admin_users.router)
    application.include_router(admin_stats.router)
    application.include_router(admin_archive.router)

    @application.on_event("startup")
    async def _startup() -> None:
        state = get_state()
        store_mode = os.environ.get("ARENA_SESSION_STORE", "memory").lower()
        if store_mode == "supabase":
            if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "session_store_config_invalid",
                    "reason": "missing_supabase_env",
                    "SUPABASE_URL": bool(SUPABASE_URL),
                    "SUPABASE_SERVICE_KEY": bool(SUPABASE_SERVICE_KEY),
                }), file=sys.stderr)
                # keep in-memory store as fallback
            else:
                try:
                    ss = SupabaseSessionStore()
                    state.session_store = ss
                    print(_json_dumps({"t": _utc_now_iso(), "type": "session_store_initialized", "mode": "supabase"}))
                except Exception as exc:  # pragma: no cover - defensive
                    print(_json_dumps({
                        "t": _utc_now_iso(),
                        "type": "session_store_init_failed",
                        "error": str(exc)
                    }), file=sys.stderr)
                    state.session_store = SessionStore()
        else:
            print(_json_dumps({"t": _utc_now_iso(), "type": "session_store_initialized", "mode": "memory"}))

        # Optional: schedule archive job (Supabase -> CSV -> Drive)
        if not ARCHIVE_ENABLED:
            return

        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore
        except Exception as exc:  # pragma: no cover
            print(f"[WARN] ARCHIVE_ENABLED=1 but apscheduler missing: {exc}", file=sys.stderr)
            return

        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            print("[WARN] ARCHIVE_ENABLED=1 but Supabase env missing", file=sys.stderr)
            return

        if not DRIVE_CREDS_JSON or not DRIVE_FOLDER_ID:
            print("[WARN] ARCHIVE_ENABLED=1 but Drive env missing", file=sys.stderr)
            return

        scheduler = AsyncIOScheduler(timezone="UTC")

        async def _job() -> None:
            try:
                await _run_archive_once()
            except Exception as exc:
                print(f"[WARN] archive job failed: {exc}", file=sys.stderr)

        # run once shortly after boot, then every N hours
        scheduler.add_job(_job, "date", run_date=datetime.utcnow())
        scheduler.add_job(_job, "interval", hours=max(1, ARCHIVE_INTERVAL_HOURS))
        scheduler.start()

        print(_json_dumps({"t": _utc_now_iso(), "type": "startup", "archive": True, "interval_h": ARCHIVE_INTERVAL_HOURS}))

    return application


app = create_app()
