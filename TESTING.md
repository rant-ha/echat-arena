# Empathy Arena - Quick Test Guide

## 1) Backend smoke test (local)

Prereqs: set env vars (see [`.env.example`](.env.example)).

Run:
```bash
python -m py_compile app.py
PORT=8000 OPENAI_API_BASE=... OPENAI_API_KEY=... uvicorn app:app --host 0.0.0.0 --port 8000 --workers 1
```

Health:
```bash
curl -s http://localhost:8000/health | jq
```

Config:
```bash
curl -s http://localhost:8000/api/arena/config | jq
```

## 2) SSE battle test

Use curl to observe streaming frames:
```bash
curl -N -H "Content-Type: application/json" \
  -d '{"prompt":"我最近压力很大，睡不着"}' \
  http://localhost:8000/api/arena/battle
```

Expected:
- first frame: `side=meta` with `session_id`
- then multiple frames with `side=left/right` and `delta`
- final frames: `finish=true`

## 3) Vote test

Copy the `session_id` from the meta frame.

```bash
curl -s -H "Content-Type: application/json" \
  -d '{
    "session_id":"<session_id>",
    "vote":"model_a",
    "prompt":"我最近压力很大，睡不着",
    "left_model":"anonymous_a",
    "right_model":"anonymous_b",
    "user_tags":["sleep","stress"],
    "user_comment":"更喜欢更具体的建议",
    "client_info":"curl"
  }' \
  http://localhost:8000/api/arena/vote | jq
```

Expected:
- response contains `revealed_left/right` with `arm` and `model_id`
- if Supabase env is configured, row should appear in `public.votes`

## 4) Archive test (optional)

Enable:
- `ARCHIVE_ENABLED=1`
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `DRIVE_CREDS_JSON` (single-line JSON), `DRIVE_FOLDER_ID`

Manual trigger:
```bash
curl -s -X POST http://localhost:8000/api/arena/admin/archive | jq
```

Expected:
- a CSV file uploaded into Drive folder

## 5) Heroku runtime checks

- Ensure only one controller is started (see [`start.sh`](start.sh)).
- Ensure router buffering is disabled via `X-Accel-Buffering: no` in SSE response.
- Logs:
  - vote inserts log to stdout as JSON
  - archive job logs `type=archive`
