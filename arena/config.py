"""Arena configuration: environment variables, constants, and model config loading."""

import json
import os
import sys
from typing import Any, Dict, List, Tuple

# ---------------------------------------------------------------------------
# App meta
# ---------------------------------------------------------------------------
APP_VERSION = "0.6.0"
API_PREFIX = "/api/arena"

# ---------------------------------------------------------------------------
# File paths
# ---------------------------------------------------------------------------
CONFIG_PATH = os.environ.get("ARENA_API_CONFIG", "api_endpoints.json")
TEMPLATE_PATH = os.environ.get("ARENA_TEMPLATE_PATH", "templates.json")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

# ---------------------------------------------------------------------------
# OpenAI-compatible defaults (Heroku Config Vars)
# ---------------------------------------------------------------------------
DEFAULT_API_BASE = os.environ.get("OPENAI_API_BASE", "").rstrip("/")
DEFAULT_API_KEY = os.environ.get("OPENAI_API_KEY", "")

# ---------------------------------------------------------------------------
# Single-model A/B config
# ---------------------------------------------------------------------------
REPLY_MODEL_NAME = os.environ.get("REPLY_MODEL_NAME", "").strip()
REPLY_API_BASE = os.environ.get("REPLY_API_BASE", DEFAULT_API_BASE).rstrip("/")
REPLY_API_KEY = os.environ.get("REPLY_API_KEY", DEFAULT_API_KEY)

# ---------------------------------------------------------------------------
# Model IDs (legacy envs kept but will be overridden by REPLY_MODEL_NAME when set)
# ---------------------------------------------------------------------------
BASELINE_MODEL_ID = os.environ.get("BASELINE_MODEL", "").strip()
EMPATHY_MODEL_ID = os.environ.get("EMPATHY_MODEL", "").strip()
EMOTION_MODEL_ID = os.environ.get("EMOTION_MODEL", "").strip()
EVAL_MODEL_ID = os.environ.get("EVAL_MODEL", "").strip()

# ---------------------------------------------------------------------------
# Supabase (service role for insert)
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# ---------------------------------------------------------------------------
# Archive to Google Drive (optional)
# ---------------------------------------------------------------------------
_ARCHIVE_ENABLED_RAW = os.environ.get("ARCHIVE_ENABLED", "0").strip().lower()
ARCHIVE_ENABLED = _ARCHIVE_ENABLED_RAW in {"1", "true", "yes", "y", "on"}
ARCHIVE_INTERVAL_HOURS = int(os.environ.get("ARCHIVE_INTERVAL_HOURS", "4"))
DRIVE_CREDS_JSON = os.environ.get("DRIVE_CREDS_JSON", "")
DRIVE_FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID", "")

# ---------------------------------------------------------------------------
# Basic safety/limits
# ---------------------------------------------------------------------------
REQUEST_TIMEOUT = float(os.environ.get("ARENA_REQUEST_TIMEOUT", "60"))
MAX_RETRIES = int(os.environ.get("ARENA_MAX_RETRIES", "3"))
BACKOFF_BASE = float(os.environ.get("ARENA_BACKOFF_BASE", "1"))

# SSE keepalive (Heroku router idle timeout protection)
SSE_HEARTBEAT_SEC = float(os.environ.get("ARENA_SSE_HEARTBEAT_SEC", "25"))

# Emotion classification timeout (avoid blocking first bytes)
CLASSIFY_TIMEOUT_SEC = float(os.environ.get("ARENA_CLASSIFY_TIMEOUT_SEC", "12"))

# ---------------------------------------------------------------------------
# Labels (align with plan)
# ---------------------------------------------------------------------------
ALLOWED_EMOTIONS = ["anger", "sadness", "anxiety", "fear", "happy", "neutral"]
ALLOWED_INTENSITIES = ["low", "medium", "high"]
ALLOWED_SUPPORT_TYPES = ["emotional", "practical", "both"]
NEUTRAL_INTENSITY = "medium"
CLASSIFICATION_ERROR = "MODEL_ERROR"

# ---------------------------------------------------------------------------
# Input validation constants (M-04 fix)
# ---------------------------------------------------------------------------
MAX_USER_INPUT_LENGTH = 5000
MIN_USER_INPUT_LENGTH = 1

# Prompt injection detection keywords (M-07 fix)
INJECTION_KEYWORDS = [
    "ignore", "forget", "bypass", "override", "system prompt",
    "instructions", "repeat above", "previous conversation",
    "disregard", "new instructions", "role play", "roleplay",
    "pretend", "act as", "you are now", "new role"
]

ALLOWED_VOTES = {"model_a", "model_b", "tie", "both_bad", "left", "right"}

# ---------------------------------------------------------------------------
# In-memory session cache (Heroku dyno memory)
# ---------------------------------------------------------------------------
_SESSION_TTL_SEC = int(os.environ.get("ARENA_SESSION_TTL_SEC", "7200"))
_MAX_SESSIONS = int(os.environ.get("ARENA_MAX_SESSIONS", "2000"))
_SESSION_CACHE_TTL_SEC = int(os.environ.get("ARENA_CACHE_TTL_SEC", "60"))
_SESSION_STORE_MODE = os.environ.get("ARENA_SESSION_STORE", "memory").lower()
_SESSION_ALLOW_FALLBACK = os.environ.get("ARENA_ALLOW_FALLBACK", "true").lower() in {"1", "true", "yes", "y", "on"}

# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_JWT_SECRET = os.environ.get("ADMIN_JWT_SECRET", os.urandom(32).hex())
TOKEN_EXPIRY_HOURS = 24

# ---------------------------------------------------------------------------
# JSON config file loading
# ---------------------------------------------------------------------------

def _load_json_file(path: str, default: Any) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:  # pragma: no cover
        print(f"[WARN] failed to load {path}: {exc}", file=sys.stderr)
        return default


_MODEL_CONFIG: Dict[str, Any] = _load_json_file(CONFIG_PATH, {})
_TEMPLATES: List[Dict[str, Any]] = _load_json_file(TEMPLATE_PATH, [])

# ---------------------------------------------------------------------------
# Model ID conditional override logic
# ---------------------------------------------------------------------------
if REPLY_MODEL_NAME:
    BASELINE_MODEL_ID = REPLY_MODEL_NAME
    EMPATHY_MODEL_ID = REPLY_MODEL_NAME
    if not EMOTION_MODEL_ID:
        EMOTION_MODEL_ID = REPLY_MODEL_NAME
    if not EVAL_MODEL_ID:
        EVAL_MODEL_ID = REPLY_MODEL_NAME

if not BASELINE_MODEL_ID or not EMPATHY_MODEL_ID:
    def _pick_models_from_config(model_cfg: Dict[str, Any]) -> Tuple[str, str]:
        keys = sorted(model_cfg.keys())
        if len(keys) >= 2:
            return keys[0], keys[1]
        if len(keys) == 1:
            return keys[0], keys[0]
        # no config; placeholder
        return "baseline", "empathy"

    b, e = _pick_models_from_config(_MODEL_CONFIG)
    BASELINE_MODEL_ID = BASELINE_MODEL_ID or b
    EMPATHY_MODEL_ID = EMPATHY_MODEL_ID or e
else:
    def _pick_models_from_config(model_cfg: Dict[str, Any]) -> Tuple[str, str]:
        keys = sorted(model_cfg.keys())
        if len(keys) >= 2:
            return keys[0], keys[1]
        if len(keys) == 1:
            return keys[0], keys[0]
        return "baseline", "empathy"

EMOTION_MODEL_ID = EMOTION_MODEL_ID or EMPATHY_MODEL_ID
EVAL_MODEL_ID = EVAL_MODEL_ID or EMPATHY_MODEL_ID


def _list_models() -> List[str]:
    # Keep simple: return all keys from api_endpoints.json
    return sorted(set(_MODEL_CONFIG.keys()))
