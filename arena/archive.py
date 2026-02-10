"""Archive helpers: CSV export and Google Drive upload."""

import io
import csv
import json
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

from arena.config import DRIVE_CREDS_JSON, DRIVE_FOLDER_ID
from arena.utils import _utc_now_iso, _json_dumps
from arena.db.helpers import _maybe_json_obj
from arena.db.votes import _fetch_all_votes_from_supabase


def _votes_to_csv_fileobj(rows: List[Dict[str, Any]]) -> "io.BytesIO":
    """Convert Supabase rows to an in-memory CSV file-like object (no disk writes)."""

    # Keep raw JSON columns AND add flattened analysis fields.
    cols = [
        "id",
        "created_at",
        "session_id",
        "user_id",
        "user_email",
        "prompt",
        "reply_a",
        "reply_b",
        "model_config",
        "user_vote",
        "user_tags",
        "user_comment",
        "ai_scores",
        "client_info",
        # New/flattened fields (for analysis)
        "model_a",
        "model_b",
        "base_model_name",
        "template_id",
        "strategy_name",
    ]

    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    w.writeheader()

    for r in rows:
        rr = dict(r)

        model_config_obj = _maybe_json_obj(rr.get("model_config"))
        rr["template_id"] = rr.get("template_id") or (model_config_obj or {}).get("template_id")
        rr["strategy_name"] = rr.get("strategy_name") or (model_config_obj or {}).get("strategy_name")
        rr["model_a"] = rr.get("model_a") or (model_config_obj or {}).get("model_a")
        rr["model_b"] = rr.get("model_b") or (model_config_obj or {}).get("model_b")

        # Stringify JSON-ish columns for CSV durability.
        for k in ("model_config", "user_tags", "ai_scores", "client_info"):
            if k in rr and rr[k] is not None and not isinstance(rr[k], str):
                rr[k] = _json_dumps(rr[k])

        w.writerow(rr)

    return io.BytesIO(buf.getvalue().encode("utf-8"))


async def _upload_csv_to_drive(csv_fileobj: "io.BytesIO", filename: str) -> None:
    """Upload an in-memory CSV to Google Drive folder."""

    if not DRIVE_CREDS_JSON or not DRIVE_FOLDER_ID:
        raise RuntimeError("DRIVE_CREDS_JSON/DRIVE_FOLDER_ID not set")

    try:
        from google.oauth2.service_account import Credentials  # type: ignore
        from googleapiclient.discovery import build  # type: ignore
        from googleapiclient.http import MediaIoBaseUpload  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "google drive deps missing; install google-api-python-client and google-auth"
        ) from exc

    creds_info = json.loads(DRIVE_CREDS_JSON)
    creds = Credentials.from_service_account_info(
        creds_info,
        scopes=["https://www.googleapis.com/auth/drive.file"],
    )

    service = build("drive", "v3", credentials=creds, cache_discovery=False)

    csv_fileobj.seek(0)
    media = MediaIoBaseUpload(csv_fileobj, mimetype="text/csv", resumable=False)
    body = {"name": filename, "parents": [DRIVE_FOLDER_ID]}
    service.files().create(body=body, media_body=media, fields="id").execute()


async def _upload_snapshot_to_drive(session_id: str, snapshot: Dict[str, Any]) -> Optional[str]:
    """Upload a JSON snapshot to Drive as a new file and return the fileId.

    Returns None if Drive is not configured or upload failed.
    """
    if not DRIVE_CREDS_JSON or not DRIVE_FOLDER_ID:
        print("[WARN] DRIVE_CREDS_JSON or DRIVE_FOLDER_ID not set; skip snapshot upload", file=sys.stderr)
        return None

    try:
        from google.oauth2.service_account import Credentials  # type: ignore
        from googleapiclient.discovery import build  # type: ignore
        from googleapiclient.http import MediaIoBaseUpload  # type: ignore
    except Exception as exc:  # pragma: no cover
        print(f"[WARN] google drive deps missing; skip snapshot upload: {exc}", file=sys.stderr)
        return None

    try:
        creds_info = json.loads(DRIVE_CREDS_JSON)
        creds = Credentials.from_service_account_info(
            creds_info,
            scopes=["https://www.googleapis.com/auth/drive.file"],
        )

        service = build("drive", "v3", credentials=creds, cache_discovery=False)

        ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        fname = f"session-{session_id}-{ts}.json"
        payload_bytes = io.BytesIO(json.dumps(snapshot, ensure_ascii=False).encode("utf-8"))
        payload_bytes.seek(0)
        media = MediaIoBaseUpload(payload_bytes, mimetype="application/json", resumable=False)
        body = {"name": fname, "parents": [DRIVE_FOLDER_ID]}
        res = service.files().create(body=body, media_body=media, fields="id,createdTime").execute()
        file_id = res.get("id")
        return file_id
    except Exception as exc:  # pragma: no cover
        print(f"[WARN] snapshot upload failed session={session_id}: {exc}", file=sys.stderr)
        return None


async def _run_archive_once() -> Dict[str, Any]:
    rows = await _fetch_all_votes_from_supabase()
    csv_fileobj = _votes_to_csv_fileobj(rows)
    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    filename = f"empathy-arena-votes-{ts}.csv"
    await _upload_csv_to_drive(csv_fileobj, filename)

    payload = {"t": _utc_now_iso(), "type": "archive", "rows": len(rows), "file": filename}
    print(_json_dumps(payload))
    return payload
