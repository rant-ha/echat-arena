"""Pytest conftest – set env vars BEFORE arena package is imported.

arena/__init__.py imports arena.main which calls create_app() at module level.
create_app() will sys.exit(1) if ALLOWED_ORIGINS is missing or wildcard.
These defaults prevent that crash in test environments.
"""

import os

os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("ADMIN_TOKEN_SECRET", "test-secret-key-for-testing")
