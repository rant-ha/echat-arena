# arena/routes/admin/ — Protected Admin Endpoints

<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-02-10 | Updated: 2026-02-15 -->

## Purpose
Admin-token-protected admin API routes for managing models, users, and arena operations. Includes authentication (admin-token header validation), model lifecycle (list, activate, deactivate), user data management (export, delete, UUID validation), metrics/stats (vote counts, battle statistics, detailed analytics), archive triggers (manual CSV export), conversation viewer (paginated list, search, CSV export with DDE protection), and strategy leaderboard (Elo-like ranking, statistical significance, manual recompute).

## Key Files
| File | Description |
|------|-------------|
| `__init__.py` | Module marker (empty) |
| `auth.py` | POST /admin/auth/login — generate JWT token with admin password; `_require_admin_token()` guard used by all admin routes |
| `models.py` | GET/POST /admin/models/{id} — list, activate, deactivate models |
| `users.py` | GET/DELETE /admin/users/{user_id} — export/delete user data (UUID validation on all 4 path params) |
| `stats.py` | GET /admin/stats/votes, /admin/statistics, /admin/statistics/detailed — vote metrics, dashboard stats, detailed analytics with daily activity, model performance, user funnel. `_fetch_all_votes()` shared with leaderboard (50k limit) |
| `archive.py` | POST /admin/archive/trigger — manually trigger CSV export to Drive |
| `leaderboard.py` | GET /admin/leaderboard — strategy rankings with Elo ratings + statistical significance (p-value, effect size, Wilson CI). POST /admin/rankings/compute — recompute and persist rankings to DB |
| `conversations.py` | GET /admin/conversations — paginated conversation list with search/filter (PostgREST injection-safe). GET /admin/conversations/export — full CSV export with DDE protection (10k row limit) |

## For AI Agents

### Working In This Directory
- All routes require JWT authentication (extract from Authorization: Bearer {token}).
- Token generation: hash admin password with ADMIN_JWT_SECRET; sign JWT with 24h expiry.
- Token validation: decode JWT, check signature, verify expiry before processing request.
- Error responses: return 401 for auth failures, 403 for permission issues.
- Use Pydantic models for request/response contracts.

### Testing Requirements
- Login: `POST /admin/auth/login` with `{"password": "..."}` → returns `{"token": "..."}`.
- Models: `GET /admin/models` with Authorization header → JSON list of models.
- Users: `GET /admin/users/{user_id}` → export user data; `DELETE /admin/users/{user_id}` → delete user.
- Stats: `GET /admin/stats/votes` → vote count per model; `GET /admin/stats/battles` → battle counts.
- Archive: `POST /admin/archive/trigger` → trigger manual export to Google Drive.

### Common Patterns
- JWT middleware: decode token from Authorization header, extract claims, validate expiry.
- Idempotency: admin operations should be safe to retry (check existing state before updates).
- Audit logging: log all admin actions to stderr with _json_dumps.
- Permission checks: verify admin role/scope in JWT claims if role-based access control is implemented.

## Dependencies

### Internal
- `arena.config` — ADMIN_PASSWORD, ADMIN_JWT_SECRET, TOKEN_EXPIRY_HOURS
- `arena.db` — vote fetch operations (for stats)
- `arena.archive` — _upload_snapshot_to_drive (for manual archive trigger)
- `arena.utils` — response formatting, error handling

### External
- **FastAPI** — APIRouter, HTTPException
- **PyJWT** — JWT token generation and verification
- **Python hashlib** — Password hashing (optional, or use bcrypt)
