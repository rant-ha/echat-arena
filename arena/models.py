"""Arena model endpoint resolution."""

from dataclasses import dataclass
from typing import Any, Dict

from arena.config import (
    REPLY_MODEL_NAME,
    REPLY_API_BASE,
    REPLY_API_KEY,
    BASELINE_MODEL_ID,
    EMPATHY_MODEL_ID,
    DEFAULT_API_BASE,
    DEFAULT_API_KEY,
    _MODEL_CONFIG,
)


@dataclass
class ModelEndpoint:
    model_id: str
    api_base: str
    api_key: str
    model_name: str


def _get_endpoint(model_id: str) -> ModelEndpoint:
    """Resolve ModelEndpoint. Support single-model REPLY_* override.

    If REPLY_MODEL_NAME is set and equals model_id (or both BASELINE/EMPATHY are set to it),
    prefer REPLY_API_BASE/KEY when provided; otherwise fall back to _MODEL_CONFIG or defaults.
    """
    # If REPLY_MODEL_NAME is configured, allow creating endpoint from REPLY_API_BASE/KEY
    if REPLY_MODEL_NAME:
        # If requested id matches the reply model, construct from REPLY_* vars
        if model_id == REPLY_MODEL_NAME or model_id in (BASELINE_MODEL_ID, EMPATHY_MODEL_ID) and REPLY_MODEL_NAME == model_id:
            api_base = REPLY_API_BASE or DEFAULT_API_BASE or ""
            api_key = REPLY_API_KEY or DEFAULT_API_KEY or ""
            model_name = REPLY_MODEL_NAME
            if api_base and api_key:
                return ModelEndpoint(model_id=REPLY_MODEL_NAME, api_base=api_base.rstrip("/"), api_key=api_key, model_name=model_name)
    # Default: lookup in config
    meta = _MODEL_CONFIG.get(model_id, {})
    api_base = (meta.get("api_base") or DEFAULT_API_BASE or "").rstrip("/")
    api_key = meta.get("api_key") or DEFAULT_API_KEY or ""
    model_name = meta.get("model_name") or model_id
    if not api_base:
        raise RuntimeError(f"missing api_base for model_id={model_id}")
    if not api_key:
        raise RuntimeError(f"missing api_key for model_id={model_id}")
    return ModelEndpoint(model_id=model_id, api_base=api_base, api_key=api_key, model_name=model_name)
