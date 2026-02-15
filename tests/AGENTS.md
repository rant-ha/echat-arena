<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-15 -->

# tests/ — Python Test Suite

## Purpose
Pytest test suite covering ranking/leaderboard backend logic. Tests are run with `python -m pytest tests/ -v`.

## Key Files
| File | Description |
|------|-------------|
| `conftest.py` | Pytest fixtures: sets required env vars (SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_TOKEN) before imports |
| `test_ranking.py` | 20 unit tests for `arena/services/ranking.py`: Elo rating computation, win/loss/tie/both_bad handling, statistical significance (p-value, effect size, Wilson CI, confidence levels) |
| `test_leaderboard_api.py` | 4 API smoke tests for leaderboard endpoints: auth guard (401), period validation (400) |

## For AI Agents

### Working In This Directory
- `conftest.py` MUST set env vars before any `arena.*` imports (module-level env dependency).
- Tests use `pytest.importorskip` pattern for optional dependencies.
- Run: `python -m pytest tests/ -v` (24 tests expected to pass).
- No mocking of external services; tests cover pure computation and input validation only.

### Testing Requirements
- Add tests for any new `arena/services/` or `arena/routes/admin/` modules.
- Keep tests fast (no network, no DB); mock external calls if needed.

### Common Patterns
- Parametrized tests with `@pytest.mark.parametrize` for edge cases.
- Direct function calls for unit tests; `TestClient` for API tests.
- `httpx.ASGITransport` + `httpx.AsyncClient` for async API testing.

## Dependencies

### Internal
- `arena.services.ranking` — Ranking computation under test
- `arena.main` — FastAPI app for API tests

### External
- **pytest** — Test framework
- **httpx** — Async HTTP client for API tests
