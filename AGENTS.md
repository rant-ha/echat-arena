# echat-arena - AI Agent Guide

**Project:** echat-arena (Empathy Arena)
**Version:** 0.6.0
**Last Updated:** 2026-01-23

---

## Project Overview

echat-arena is a web-based AI arena application for running controlled A/B testing experiments with large language models. The platform allows users to engage in anonymous multi-turn conversations comparing two AI model responses, with emotion classification and empathy-based evaluation.

**Key Features:**
- Anonymous multi-model chat comparisons (A/B testing)
- Multi-turn conversation support with full history tracking
- Emotion classification (anger, sadness, anxiety, fear, happy, neutral)
- Post-vote chat continuation with winning model
- Session persistence with Supabase backend
- Comprehensive experiment data export and analysis

---

## Architecture Overview

```
echat-arena/
├── Backend (Python FastAPI)           ← /home/ranthaha1/echat-arena/app.py
├── Frontend (Next.js 14)              ← /home/ranthaha1/echat-arena/web/
├── Database Schema (Supabase)         ← /home/ranthaha1/echat-arena/migrations/
└── Configuration & Deployment         ← .env.example, heroku.yml, Dockerfile
```

### Backend Architecture

**Technology Stack:**
- Framework: FastAPI (Python)
- Async HTTP: httpx (for upstream API calls)
- Token Counting: tiktoken (for context management)
- Database: Supabase (PostgreSQL)
- Deployment: Heroku

**Key Endpoints:**
- `POST /api/arena/battle` - Start new chat turn (SSE streaming)
- `POST /api/arena/vote` - Record vote with conversation history
- `GET /api/arena/sessions/{session_id}` - Retrieve session data
- `POST /api/arena/post-vote-chat` - Continue chat after voting

**Core Responsibilities:**
- OpenAI-compatible API proxy (supports any compatible endpoint)
- Multi-turn conversation management
- Emotion classification (via external model or configured classifier)
- Vote recording with full conversation context
- Session persistence to Supabase
- SSE streaming with Heroku router keepalive

### Frontend Architecture

**Technology Stack:**
- Framework: Next.js 14
- React Version: 18
- Language: TypeScript
- Styling: Tailwind CSS
- State Management: React hooks
- Database Auth: Supabase
- Deployment: Vercel

**Key Components:**
- `BattleClient` - Main arena page for multi-turn chat comparison
- `ConversationTurnBlock` - Reusable component for displaying conversation turns
- `AIResponseCard` - AI model response display with streaming support
- `PromptInput` - User input area with multi-turn support
- `VoteButtons` - Vote collection interface

**Key Pages:**
- `/` - Home page (redirects or landing)
- `/battle` - Main arena comparison page
- `/chat/[id]` - History chat detail view
- `/history` - User conversation history
- `/login` - Supabase authentication
- `/register` - User registration

### Database Schema

**Supabase Tables:**
- `votes` - Core voting records with conversation history
- `arena_sessions` - Persistent session data (multi-instance support)
- `post_vote_turns` - Chat continuation after voting
- Authentication handled via Supabase Auth

**Key Fields:**
- `conversation_history` (JSONB) - Full multi-turn history with user and AI responses
- `turn_count` (INTEGER) - Quick access to number of conversation turns
- `session_data` (JSONB) - Complete session state with context isolation

**Schema Versions:**
- Phase 3.3: Multi-turn conversation support (conversation_history, turn_count)
- Phase 8.2: Post-vote chat support (post_vote_turns table)
- Phase 8.3: Vote idempotency (unique session_id constraint)
- Phase 9.1: Session persistence (arena_sessions table)

---

## Directory Structure & Subdocumentation

Each major subdirectory has its own AGENTS.md file:

### `/web/` - Frontend Application
**Related Docs:**
- `web/README.md` - Development setup and proxy configuration
- `web/.env.example` - Frontend environment variables
- `web/package.json` - Dependencies and build scripts

**Purpose:** Next.js 14 frontend application for user-facing UI

**Quick Start:**
```bash
cd web
npm install
npm run dev
```

**Key Files:**
- `app/battle/page.tsx` - Main arena comparison page
- `app/chat/[id]/page.tsx` - History detail view
- `components/ConversationTurnBlock.tsx` - Reusable turn display
- `hooks/useBattleStream.ts` - SSE streaming hook
- `utils/supabase/` - Supabase client utilities

**Environment:**
- `ARENA_API_BASE` - Backend base URL (Heroku)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `NEXT_PUBLIC_ALLOWED_DOMAINS` - Email domain allowlist

---

### `/migrations/` - Database Schema
**Related Docs:**
- `migrations/README.md` - Complete migration guide with phase-by-phase breakdown
- `migrations/*.sql` - Individual migration scripts

**Purpose:** SQL migration scripts for Supabase PostgreSQL database

**Migrations (in order):**
1. `add_conversation_history.sql` - Phase 3.3 (multi-turn support)
2. `add_jsonb_indexes.sql` - Index optimization
3. `add_post_vote_chat.sql` - Phase 8.2 (post-vote chat)
4. `add_vote_idempotency.sql` - Phase 8.3 (uniqueness constraint)
5. `add_arena_sessions_table.sql` - Phase 9.1 (session persistence)

**Verification & Rollback:**
- `verify_schema.sql` - Verify migration success
- `rollback_conversation_history.sql` - Emergency rollback script

---

### `/plans/` - Implementation & Design Docs
**Related Docs:**
- `plans/DEPLOYMENT_CHECKLIST.md` - Pre-deployment verification
- `plans/MULTI_TURN_TESTING.md` - Multi-turn feature testing strategy
- `plans/PHASE_8_IMPLEMENTATION_GUIDE.md` - Phase 8 implementation details
- `plans/sessionstore_supabase_complete_design.md` - Session store design
- `plans/CODE_REVIEW_PHASE5.md` - Code review findings

**Purpose:** Implementation guides, deployment plans, and architectural decisions

---

## Root Configuration Files

### `.env.example`
Template for environment variables. Split into sections:

**Backend (Heroku):**
```
OPENAI_API_BASE=<api-endpoint>
OPENAI_API_KEY=<api-key>
REPLY_MODEL_NAME=<model-id>
SUPABASE_URL=<url>
SUPABASE_SERVICE_KEY=<key>
ARENA_SESSION_TTL_SEC=7200
ARCHIVE_ENABLED=0
```

**Frontend (Vercel):**
```
NEXT_PUBLIC_SUPABASE_URL=<url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<key>
ARENA_API_BASE=<heroku-backend-url>
```

### `app.py`
Main backend FastAPI application (Python 3.10+)

**Key Sections:**
- Configuration loading (lines 28-79)
- Emotion classifier system prompt (lines 81-120)
- Arena session management (in-memory + Supabase)
- Battle endpoint with SSE streaming
- Vote recording with conversation history
- Supabase insert and export operations
- Heartbeat/keepalive for Heroku router timeout

**Important Constants:**
- `APP_VERSION = "0.6.0"`
- `API_PREFIX = "/api/arena"`
- `ALLOWED_EMOTIONS = ["anger", "sadness", "anxiety", "fear", "happy", "neutral"]`
- `ALLOWED_INTENSITIES = ["low", "medium", "high"]`
- `ALLOWED_SUPPORT_TYPES = ["emotional", "practical", "both"]`

### `api_endpoints.json`
Configuration file for available API endpoints (model registry)

**Purpose:** Centralized model endpoint configuration

### `templates.json`
Prompt templates for different experiment conditions

**Purpose:** Template selection and variant management

### `Dockerfile`
Container configuration for Heroku deployment

**Base:** Python image with dependencies from requirements.txt

### `heroku.yml`
Heroku deployment manifest

**Includes:** Buildpacks, release commands, formation

### `start.sh`
Startup script for application

**Purpose:** Entry point for Heroku dyno or local development

### `requirements.txt`
Python dependencies

**Key Libraries:**
- fastapi
- uvicorn
- httpx
- tiktoken
- supabase-py

---

## Testing & Verification

### Test Scripts

**`test_supabase_sessionstore.py`**
- Tests session persistence to Supabase
- Validates CRUD operations on arena_sessions table
- Run: `python test_supabase_sessionstore.py`

**`test_context_aware_classification.py`**
- Tests emotion classification accuracy
- Run: `python test_context_aware_classification.py`

**`run_experiment.py`**
- Experiment execution and data analysis
- Classifier system prompt alignment with app.py
- Run: `python run_experiment.py`

### Linting & Code Quality

**Frontend:**
```bash
cd web
npm run lint        # ESLint check
npm run build       # TypeScript compilation
```

**Backend:**
- Configure IDE with pylint or flake8 for Python code

---

## Common Development Tasks

### Starting Local Development

**Backend:**
```bash
# Install dependencies
pip install -r requirements.txt

# Set up .env with local values
cp .env.example .env

# Run FastAPI development server
python -m uvicorn app:app --reload --port 8000
```

**Frontend:**
```bash
cd web
npm install
npm run dev    # Runs on http://localhost:3000
```

### Key Environment Variables

**For Development:**
- Use local Supabase project or mock authentication
- Point `ARENA_API_BASE` to `http://localhost:8000` in frontend
- Generate test Supabase keys

**For Production (Heroku + Vercel):**
- Backend: Set via Heroku Config Vars
- Frontend: Set via Vercel Environment Variables
- Use service role key for backend (read/write votes)
- Use anon key for frontend (auth only)

### Adding New Models

1. Add model endpoint to `api_endpoints.json`
2. Update `REPLY_MODEL_NAME` or legacy model IDs
3. Restart backend to reload config
4. Test via `/api/arena/battle` endpoint

### Database Migrations

1. Write new `.sql` file in `migrations/`
2. Test in Supabase SQL Editor
3. Document in `migrations/README.md`
4. Add verification query to `verify_schema.sql`
5. Execute in Supabase Dashboard
6. Run `verify_schema.sql` to confirm

---

## API Reference

### Battle Endpoint (SSE Streaming)

**Endpoint:** `POST /api/arena/battle`

**Request:**
```json
{
  "prompt": "用户输入的提示词",
  "session_id": "optional-session-uuid",
  "model_a": "baseline-model-id",
  "model_b": "strategy-model-id",
  "use_sse": true
}
```

**Response:** Server-Sent Events stream with JSON messages

**Message Types:**
- `{"type": "stream", "arm": "left", "delta": "text_chunk"}`
- `{"type": "stream", "arm": "right", "delta": "text_chunk"}`
- `{"type": "done", "arm": "left", "text": "full_response"}`
- `{"type": "done", "arm": "right", "text": "full_response"}`

### Vote Endpoint

**Endpoint:** `POST /api/arena/vote`

**Request:**
```json
{
  "session_id": "session-uuid",
  "winner": "left" | "right",
  "conversation_history": [...],
  "turn_count": 1,
  "emotion": "neutral",
  "intensity": "medium",
  "support_type": "both"
}
```

**Response:**
```json
{
  "success": true,
  "vote_id": "vote-uuid"
}
```

---

## Deployment

### Backend (Heroku)

**Files:**
- `Dockerfile` - Container definition
- `heroku.yml` - Deployment manifest
- `requirements.txt` - Python dependencies

**Steps:**
1. Create Heroku app
2. Set config vars from `.env.example`
3. Deploy: `git push heroku main`
4. Monitor: `heroku logs --tail`

**Domains:**
- Heroku provides `https://<app-name>.herokuapp.com`
- Frontend points to this via `ARENA_API_BASE`

### Frontend (Vercel)

**Files:**
- `web/package.json` - Node dependencies
- `web/.env.example` - Environment variables
- `web/next.config.mjs` - Next.js configuration

**Steps:**
1. Connect GitHub repository to Vercel
2. Set environment variables from `web/.env.example`
3. Deploy: Auto-deploy on push to main
4. View: `https://<project>.vercel.app`

---

## Troubleshooting

### Common Issues

**SSE Connection Drops:**
- Backend sends heartbeat every 25 seconds (configurable: `ARENA_SSE_HEARTBEAT_SEC`)
- Frontend should implement reconnection logic
- Check Heroku router timeout (default 30s) - increase if needed

**Session Not Persisting:**
- Check `SUPABASE_SERVICE_KEY` is set (service role, not anon)
- Verify `arena_sessions` table exists (run migrations)
- Check Supabase connection in logs: `heroku logs --tail`

**Emotion Classification Timeout:**
- Default timeout: 12 seconds (`ARENA_CLASSIFY_TIMEOUT_SEC`)
- If classifier is slow, increase timeout or optimize model
- Non-blocking: First bytes returned before classification completes

**Token Count Issues:**
- `tiktoken` library not installed: Falls back to naive estimation
- Install via: `pip install tiktoken`
- Verify in logs: `[WARN] tiktoken not available...`

### Related Documentation

- `DEPLOYMENT_GUIDE.md` - Complete deployment walkthrough
- `DEPLOYMENT_GUIDE_SESSIONSTORE.md` - Session persistence setup
- `TROUBLESHOOTING.md` - Detailed troubleshooting guide
- `TESTING.md` - Testing strategies and test execution

---

## Code Standards & Patterns

### Python Backend

**File Organization:**
- Config loading at top (lines 28-79 in app.py)
- Dataclass definitions for request/response models
- Async functions for I/O operations (httpx calls, database)
- Synchronous utility functions for local logic

**Naming Conventions:**
- Private functions: `_snake_case_with_leading_underscore`
- Public endpoints: `/api/arena/endpoint_name`
- Environment variables: `UPPERCASE_WITH_UNDERSCORES`

**Error Handling:**
- HTTPException for API errors with proper status codes
- Try/except blocks for external API calls with retry logic
- Graceful degradation (e.g., tiktoken fallback)

### TypeScript Frontend

**File Organization:**
- Pages in `app/` directory
- Components in `components/` directory
- Hooks in `hooks/` directory (custom React hooks)
- Utilities in `utils/` directory

**Naming Conventions:**
- React components: PascalCase
- Hooks: `use` prefix (e.g., `useBattleStream`)
- Utility functions: camelCase

**Types:**
- Define interfaces for API responses
- Use TypeScript strict mode
- Avoid `any` type - use proper typing

---

## Multi-Turn Conversation Design

### Conversation Flow

1. **Turn 1:** User enters initial prompt
   - Both models generate responses
   - Responses displayed simultaneously

2. **Turns 2+:** User can continue typing
   - Each model uses own context history
   - Context isolation: left model only sees its own history, right model sees its own

3. **Voting:** After any turn (1+)
   - User selects winner (left or right)
   - Complete conversation history saved to `conversation_history` field
   - Vote recorded with `turn_count` and full context

4. **Post-Vote Chat:** Optional continuation
   - User can chat with winning model after voting
   - Stored in separate `post_vote_turns` table
   - Does not affect original vote data

### Data Structure (conversation_history)

```json
[
  {
    "turn": 1,
    "user": "First user message",
    "reply_a": "Model A response",
    "reply_b": "Model B response",
    "timestamp": "ISO-8601"
  },
  {
    "turn": 2,
    "user": "Follow-up message",
    "reply_a": "Model A response",
    "reply_b": "Model B response",
    "timestamp": "ISO-8601"
  }
]
```

### Context Isolation

**Left Model Context:**
```json
[
  {"role": "user", "content": "First message"},
  {"role": "assistant", "content": "Left response 1"},
  {"role": "user", "content": "Follow-up"},
  {"role": "assistant", "content": "Left response 2"}
]
```

**Right Model Context:**
```json
[
  {"role": "user", "content": "First message"},
  {"role": "assistant", "content": "Right response 1"},
  {"role": "user", "content": "Follow-up"},
  {"role": "assistant", "content": "Right response 2"}
]
```

Each model only knows its own responses, not the competing model's responses.

---

## Emotion Classification System

### Classification Categories

**Emotion (6 categories):**
- `anger` - Anger, irritation, offense
- `sadness` - Sadness, loss, disappointment
- `anxiety` - Worry, tension, pressure
- `fear` - Fear, dread of consequences
- `happy` - Joy, contentment, satisfaction
- `neutral` - Neutral emotional tone

**Intensity (3 levels):**
- `low` - Mild emotion
- `medium` - Moderate emotion (default)
- `high` - Strong emotion

**Support Type (3 categories):**
- `emotional` - Emotional support/companionship
- `practical` - Practical advice/solutions
- `both` - Both emotional and practical support

### Classifier Implementation

**Location:** `app.py` (lines 81-120+)

**System Prompt:**
- Chinese text (supports Chinese input classification)
- Structured JSON output format
- 6-emotion classification
- Returns emotion + intensity + support_type + comment

**Integration:**
- Runs asynchronously (non-blocking)
- Default timeout: 12 seconds
- Fallback: `CLASSIFICATION_ERROR` on timeout or failure
- Result included in vote record

---

## Session Management

### In-Memory Sessions (Default)

**Location:** `app.py` - session dictionary

**TTL:** Configurable via `ARENA_SESSION_TTL_SEC` (default: 7200 seconds = 2 hours)

**Max Sessions:** `ARENA_MAX_SESSIONS` (default: 2000)

**Issue:** Sessions lost on Heroku dyno restart

### Supabase Session Store (Phase 9.1)

**Table:** `arena_sessions` (new in Phase 9.1)

**Fields:**
- `session_id` (TEXT) - Primary key
- `session_data` (JSONB) - Full session state
- `version` (BIGINT) - Optimistic lock
- `expires_at` (TIMESTAMPTZ) - TTL support
- `deleted_at` (TIMESTAMPTZ) - Soft delete support

**Features:**
- Persistent across dyno restarts
- Multi-instance consistency (shared state)
- Optimistic locking for concurrent updates
- Soft delete for data recovery
- Automatic cleanup of expired sessions

**Benefit:** Enables multi-instance deployment and high availability

---

## Archive & Export Features

### Google Drive Archive

**Configuration:**
- Enable via `ARCHIVE_ENABLED=1`
- `DRIVE_CREDS_JSON` - Service account credentials (single-line JSON)
- `DRIVE_FOLDER_ID` - Target folder ID
- `ARCHIVE_INTERVAL_HOURS` - Scheduled interval (default: 4 hours)

**Purpose:**
- Scheduled backup of all votes to Google Drive
- CSV export format
- Runs in background on separate task

### Manual Export

**Endpoint:** `GET /api/arena/export`

**Purpose:**
- Export all votes as CSV
- Downloadable from frontend
- Includes conversation history and metadata

---

## Related Documentation

**Root Documentation:**
- `README.md` - Project overview (Chinese)
- `DEPLOYMENT_GUIDE.md` - Complete deployment walkthrough
- `DEPLOYMENT_GUIDE_SESSIONSTORE.md` - Session persistence setup
- `DEPLOYMENT_GUIDE_UPDATED_SESSIONSTORE.md` - Latest updates
- `TESTING.md` - Testing strategies
- `TROUBLESHOOTING.md` - Common issues and fixes

**Phase-Specific:**
- `plans/DEPLOYMENT_CHECKLIST.md` - Pre-deployment checklist
- `plans/PHASE_8_IMPLEMENTATION_GUIDE.md` - Phase 8 details
- `plans/MULTI_TURN_TESTING.md` - Multi-turn testing

**Subdirectories:**
- See `web/README.md` for frontend details
- See `migrations/README.md` for schema migration details

---

## Quick Reference: Common Commands

### Development

```bash
# Backend
pip install -r requirements.txt
python -m uvicorn app:app --reload

# Frontend
cd web && npm install && npm run dev

# Tests
python test_supabase_sessionstore.py
python test_context_aware_classification.py
cd web && npm run lint
```

### Deployment

```bash
# Heroku backend
git push heroku main
heroku logs --tail

# Vercel frontend (auto-deploy on push)
# Manual: vercel --prod
```

### Database

```bash
# In Supabase SQL Editor
-- Run migration
\i migrations/add_conversation_history.sql

-- Verify
\i migrations/verify_schema.sql

-- Export votes
SELECT * FROM votes ORDER BY created_at DESC;
```

---

## Architecture Decision Records (ADRs)

### ADR-001: Single Model for Controlled Testing

**Decision:** Use `REPLY_MODEL_NAME` for single model instead of multi-model setup

**Rationale:** Enables controlled variable experiments with consistent model

**Impact:** Legacy multi-model switches still available for backward compatibility

### ADR-002: Context Isolation

**Decision:** Each model maintains independent context history

**Rationale:** Prevents information leakage about competing model

**Impact:** Models cannot see opponent's responses; fair comparison

### ADR-003: Persistent Session Store (Phase 9.1)

**Decision:** Use Supabase arena_sessions table for session persistence

**Rationale:** Enables multi-instance deployment and recovery from restarts

**Impact:** Session data survives Heroku dyno restarts; supports scaling

### ADR-004: Post-Vote Chat Separation (Phase 8.2)

**Decision:** Store post-vote chats in separate `post_vote_turns` table

**Rationale:** Keeps experimental data (votes) clean and uncontaminated

**Impact:** User can continue chatting after voting without affecting data analysis

---

## Contributing & Code Review

### Pre-Commit Checklist

- [ ] Code passes linting (`npm run lint` for frontend)
- [ ] Tests pass (`python test_*.py` for backend)
- [ ] Environment variables documented
- [ ] Database migrations included (if schema changed)
- [ ] AGENTS.md updated for architectural changes

### Code Review Focus

1. **Type Safety:** TypeScript strict mode, proper Python typing
2. **Error Handling:** Graceful degradation, proper HTTP status codes
3. **Performance:** No N+1 queries, efficient JSONB operations
4. **Security:** No secrets in code, proper access control
5. **Backward Compatibility:** Existing data not broken by changes

---

## Support & Contact

**Documentation:**
- See TROUBLESHOOTING.md for common issues
- See DEPLOYMENT_GUIDE.md for setup issues
- See migrations/README.md for database issues

**Code Issues:**
- See AUDIT_REPORT.md for code quality findings
- See CODE_REVIEW_PHASE5.md for design review feedback

**Experiment Issues:**
- See plans/MULTI_TURN_TESTING.md for testing guidance
- See run_experiment.py for experiment execution

---

**Last Updated:** 2026-01-23
**Version:** 0.6.0
**Maintainer:** AI Agent Guide
