# eChat Arena — Root

<!-- Generated: 2026-02-10 | Updated: 2026-02-15 -->

## Purpose
eChat Arena is a dual-model A/B testing platform for evaluating emotional support AI strategies. Backend is a Python FastAPI application (arena/ package), frontend is Next.js 14 deployed separately. Dual-deployment architecture: Heroku (backend) + Vercel (frontend) + Supabase (database). Users chat with two anonymous models simultaneously, vote on the better response, and optionally continue chatting with the winner.

## Key Files
| File | Description |
|------|-------------|
| `app.py` | Thin shim entrypoint; imports FastAPI app from arena package |
| `Dockerfile` | Multi-stage build with Python 3.9, pinned Pydantic/HF Hub versions, PyTorch CPU |
| `heroku.yml` | Heroku build and run config; orchestrates Dockerfile + start.sh |
| `start.sh` | Startup script: injects env vars into api_endpoints.json, starts Controller, launches uvicorn |
| `api_endpoints.json` | Model endpoint registry (api_base, api_key, model_name) |
| `templates.json` | Empathy prompt templates keyed by emotion+intensity |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `arena/` | Main FastAPI application package (~40 Python modules) (see `arena/AGENTS.md`) |
| `web/` | Next.js 14 frontend (separate deployment) (see `web/AGENTS.md`) |
| `docs/` | Project documentation: analyses, guides, plans, reviews (see `docs/AGENTS.md`) |
| `migrations/` | SQL migration scripts for Supabase PostgreSQL (see `migrations/AGENTS.md`) |
| `tests/` | Python test suite: ranking unit tests, API smoke tests (see `tests/AGENTS.md`) |
| `scripts/` | Utility scripts (DB migration helpers) |

## For AI Agents

### Working In This Directory
- Root is deployment/orchestration layer only; all logic lives in arena/ package.
- Changes to `app.py` are rare (it's a shim).
- Dockerfile tweaks must respect locked versions: Pydantic 2.8.2, huggingface_hub 0.23.0, Gradio 4.44.1.
- start.sh injects config from Heroku env vars; test locally by running `python3 start.sh` or `uvicorn app:app --reload`.

### Testing Requirements
- Local: `uvicorn app:app --reload` (requires OPENAI_API_KEY, SUPABASE_URL, etc.)
- Docker: `docker build -t echat-arena . && docker run -e OPENAI_API_KEY=... echat-arena`
- Heroku: `git push heroku main` (auto-builds and deploys)

### Common Patterns
- Environment variables override config files (start.sh injects into api_endpoints.json).
- Two-stage startup: FastChat Controller (port 21001) + FastAPI (port $PORT, default 8000).
- All async business logic in arena/ modules; root is infrastructure only.

## Dependencies

### Internal
- `arena/` — Main FastAPI package with routes, services, db, session, config.

### External
- **Python 3.9-slim** base image.
- **FastAPI + uvicorn** — Web framework and ASGI server.
- **Pydantic 2.8.2** — Data validation (pinned for Gradio compatibility).
- **Supabase (httpx)** — Async PostgreSQL ORM via REST API.
- **OpenAI API** — LLM provider for dual-model evaluation.
- **PyTorch (CPU)** — Optional, for local inference or embeddings.
- **APScheduler** — Optional async job scheduler for archive tasks (Google Drive export).
- **FastChat** — Optional, for local model serving.

## Deployment Notes
- Heroku dyno: 1x (sync workers=1 to avoid memory bloat).
- Vercel (frontend) calls `/api/arena/*` endpoints via CORS-enabled backend.
- Supabase DB schema: tables include votes, sessions, post_vote_turns.
- Archive job (optional): exports CSV to Google Drive every N hours.
