"""FastAPI application assembly."""

import os
import sys
from datetime import datetime

import httpx

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
    REDIS_URL,
    REDIS_SESSION_TTL_SEC,
    REDIS_MAX_CONNECTIONS,
)
from arena.utils import _utc_now_iso, _json_dumps
from arena.state import get_state
from arena.session import SupabaseSessionStore, SessionStore, RedisSessionStore, HybridSessionStore
from arena.archive import _run_archive_once
from arena.db.client import close_supabase_client
from arena.db.compensation import compensation_queue
from arena.db.post_vote import _insert_post_vote_turn_supabase

from arena.routes import health, config_routes, battle, vote, chat, drafts, sessions
from arena.routes.admin import auth as admin_auth
from arena.routes.admin import models as admin_models
from arena.routes.admin import users as admin_users
from arena.routes.admin import stats as admin_stats
from arena.routes.admin import archive as admin_archive
from arena.routes.admin import conversations as admin_conversations
from arena.routes.admin import leaderboard as admin_leaderboard


def create_app() -> FastAPI:
    application = FastAPI(title="Empathy Arena API", version=APP_VERSION)

    # CORS — reject wildcard origins for security
    origins = [o for o in ALLOWED_ORIGINS if o.strip() and o.strip() != "*"]
    if not origins:
        print("[FATAL] ALLOWED_ORIGINS must be set to specific domains (not '*'). "
              "Example: ALLOWED_ORIGINS=https://your-app.vercel.app", file=sys.stderr)
        sys.exit(1)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Warn if admin password not set
    from arena.config import ADMIN_PASSWORD
    if not ADMIN_PASSWORD:
        print("[WARN] ADMIN_PASSWORD is not set — admin login disabled", file=sys.stderr)

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
    application.include_router(admin_conversations.router)
    application.include_router(admin_leaderboard.router)

    @application.on_event("startup")
    async def _startup() -> None:
        state = get_state()
        store_mode = os.environ.get("ARENA_SESSION_STORE", "memory").lower()

        # --- Redis (L1) + optional Supabase (L2) hybrid ---
        if store_mode == "redis":
            if REDIS_URL and RedisSessionStore is not None:
                try:
                    redis_store = RedisSessionStore(
                        redis_url=REDIS_URL,
                        ttl_sec=REDIS_SESSION_TTL_SEC,
                        max_connections=REDIS_MAX_CONNECTIONS,
                    )
                    if SUPABASE_URL and SUPABASE_SERVICE_KEY and HybridSessionStore is not None:
                        supabase_store = SupabaseSessionStore()
                        state.session_store = HybridSessionStore(redis_store, supabase_store)
                        print(_json_dumps({"t": _utc_now_iso(), "type": "session_store_initialized", "mode": "hybrid", "l1": "redis", "l2": "supabase"}))
                    else:
                        state.session_store = redis_store
                        print(_json_dumps({"t": _utc_now_iso(), "type": "session_store_initialized", "mode": "redis"}))

                    # Initialize compensation queue
                    compensation_queue.set_insert_fn(_insert_post_vote_turn_supabase)
                    compensation_queue.load_from_backup()
                except Exception as exc:
                    print(_json_dumps({
                        "t": _utc_now_iso(),
                        "type": "redis_session_store_init_failed",
                        "error": str(exc),
                    }), file=sys.stderr)
                    # Fall back to supabase or memory
                    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
                        state.session_store = SupabaseSessionStore()
                        print(_json_dumps({"t": _utc_now_iso(), "type": "session_store_initialized", "mode": "supabase", "reason": "redis_init_error"}))
                        compensation_queue.set_insert_fn(_insert_post_vote_turn_supabase)
                        compensation_queue.load_from_backup()
                    else:
                        state.session_store = SessionStore()
                        print(_json_dumps({"t": _utc_now_iso(), "type": "session_store_initialized", "mode": "memory", "reason": "redis_init_error"}))
            else:
                # Redis requested but package missing or REDIS_URL not set — degrade gracefully
                _reason = "redis_package_missing" if RedisSessionStore is None else "redis_url_missing"
                print(_json_dumps({
                    "t": _utc_now_iso(),
                    "type": "redis_unavailable",
                    "reason": _reason,
                    "REDIS_URL": bool(REDIS_URL),
                    "RedisSessionStore": RedisSessionStore is not None,
                }), file=sys.stderr)
                if SUPABASE_URL and SUPABASE_SERVICE_KEY:
                    state.session_store = SupabaseSessionStore()
                    print(_json_dumps({"t": _utc_now_iso(), "type": "session_store_initialized", "mode": "supabase", "reason": _reason}))
                    compensation_queue.set_insert_fn(_insert_post_vote_turn_supabase)
                    compensation_queue.load_from_backup()
                else:
                    state.session_store = SessionStore()
                    print(_json_dumps({"t": _utc_now_iso(), "type": "session_store_initialized", "mode": "memory", "reason": _reason}))

        # --- Supabase only ---
        elif store_mode == "supabase":
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
                    # Supabase connectivity health check (non-blocking)
                    try:
                        async with httpx.AsyncClient() as hc_client:
                            health_url = f"{SUPABASE_URL}/rest/v1/"
                            resp = await hc_client.get(health_url, headers={
                                "apikey": SUPABASE_SERVICE_KEY,
                                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                            }, timeout=10)
                            if resp.status_code < 400:
                                print(_json_dumps({"t": _utc_now_iso(), "type": "supabase_health_ok"}))
                            else:
                                print(_json_dumps({
                                    "t": _utc_now_iso(), "type": "supabase_health_warning",
                                    "status": resp.status_code
                                }), file=sys.stderr)
                    except Exception as hc_exc:
                        print(_json_dumps({
                            "t": _utc_now_iso(), "type": "supabase_health_failed",
                            "error": str(hc_exc)
                        }), file=sys.stderr)
                    # Initialize compensation queue for failed write retries
                    compensation_queue.set_insert_fn(_insert_post_vote_turn_supabase)
                    compensation_queue.load_from_backup()
                except Exception as exc:  # pragma: no cover - defensive
                    print(_json_dumps({
                        "t": _utc_now_iso(),
                        "type": "session_store_init_failed",
                        "error": str(exc)
                    }), file=sys.stderr)
                    state.session_store = SessionStore()
        # --- Memory only ---
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

    @application.on_event("shutdown")
    async def _shutdown() -> None:
        # Process any remaining compensation queue entries
        try:
            recovered = await compensation_queue.process_queue()
            if recovered:
                print(_json_dumps({"t": _utc_now_iso(), "type": "shutdown_compensation_recovered", "count": recovered}))
        except Exception as exc:
            print(_json_dumps({"t": _utc_now_iso(), "type": "shutdown_compensation_error", "error": str(exc)}), file=sys.stderr)

        # Close Redis connection pool if hybrid/redis store is active
        state = get_state()
        close_fn = getattr(state.session_store, "close", None)
        if close_fn and callable(close_fn):
            try:
                await close_fn()
                print(_json_dumps({"t": _utc_now_iso(), "type": "redis_connection_pool_closed"}))
            except Exception as exc:
                print(_json_dumps({"t": _utc_now_iso(), "type": "redis_close_error", "error": str(exc)}), file=sys.stderr)

        # Close shared HTTP client
        await close_supabase_client()
        print(_json_dumps({"t": _utc_now_iso(), "type": "shutdown_complete"}))

    return application


app = create_app()
