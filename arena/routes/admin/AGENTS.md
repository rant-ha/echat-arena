# arena/routes/admin/ — Protected Admin Endpoints

<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-02-10 -->

## Purpose
JWT-protected admin API routes for managing models, users, and arena operations. Includes authentication (JWT token generation), model lifecycle (list, activate, deactivate), user data management (export, delete), metrics/stats (vote counts, battle statistics), and archive triggers (manual CSV export to Google Drive).

## Key Files
| File | Description |
|------|-------------|
| `__init__.py` | Module marker (empty) |
| `auth.py` | POST /admin/auth/login — generate JWT token with admin password |
| `models.py` | GET/POST /admin/models/{id} — list, activate, deactivate models |
| `users.py` | GET/DELETE /admin/users/{user_id} — export/delete user data |
| `stats.py` | GET /admin/stats/votes, /admin/stats/battles — retrieve metrics |
| `archive.py` | POST /admin/archive/trigger — manually trigger CSV export to Drive |

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
