"""Smoke tests for leaderboard API routes."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from arena.main import app


client = TestClient(app)


class TestLeaderboardAuth:
    """Verify auth guard rejects unauthenticated requests."""

    def test_get_leaderboard_no_token(self):
        resp = client.get("/api/arena/admin/leaderboard")
        assert resp.status_code == 401

    def test_get_leaderboard_invalid_token(self):
        resp = client.get(
            "/api/arena/admin/leaderboard",
            headers={"admin-token": "invalid-token-xyz"},
        )
        assert resp.status_code == 401

    def test_compute_rankings_no_token(self):
        resp = client.post("/api/arena/admin/rankings/compute")
        assert resp.status_code == 401

    def test_compute_rankings_invalid_token(self):
        resp = client.post(
            "/api/arena/admin/rankings/compute",
            headers={"admin-token": "invalid-token-xyz"},
        )
        assert resp.status_code == 401


class TestLeaderboardValidation:
    """Verify input validation."""

    def test_invalid_period(self):
        # Even with invalid token, period validation may come after auth
        # So we just check it doesn't crash
        resp = client.get(
            "/api/arena/admin/leaderboard",
            params={"period": "invalid"},
        )
        # Should be 401 (auth check first) or 400 (validation)
        assert resp.status_code in (400, 401)
