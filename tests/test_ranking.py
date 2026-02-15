"""Tests for arena.services.ranking module."""

from __future__ import annotations

import pytest
from arena.services.ranking import (
    BradleyTerryModel,
    compute_rankings_from_votes,
    compute_statistical_significance,
)


class TestBradleyTerryModel:
    def test_expected_score_equal_ratings(self):
        model = BradleyTerryModel()
        assert model.expected_score(1000, 1000) == pytest.approx(0.5)

    def test_expected_score_higher_rating_favored(self):
        model = BradleyTerryModel()
        assert model.expected_score(1400, 1000) > 0.5
        assert model.expected_score(1000, 1400) < 0.5

    def test_update_ratings_win(self):
        model = BradleyTerryModel()
        new_a, new_b = model.update_ratings(1000, 1000, 1.0)
        assert new_a > 1000  # winner gains
        assert new_b < 1000  # loser drops

    def test_update_ratings_loss(self):
        model = BradleyTerryModel()
        new_a, new_b = model.update_ratings(1000, 1000, 0.0)
        assert new_a < 1000
        assert new_b > 1000

    def test_update_ratings_tie(self):
        model = BradleyTerryModel()
        new_a, new_b = model.update_ratings(1000, 1000, 0.5)
        assert new_a == pytest.approx(1000, abs=0.01)
        assert new_b == pytest.approx(1000, abs=0.01)


class TestComputeRankingsFromVotes:
    def test_empty_votes(self):
        result = compute_rankings_from_votes([])
        assert "empathy" in result
        assert "baseline" in result
        assert result["empathy"]["rating"] == 1000.0
        assert result["baseline"]["rating"] == 1000.0
        assert result["empathy"]["total_battles"] == 0

    def test_single_strategy_win(self):
        votes = [{"user_vote": "model_a", "winner_type": "strategy"}]
        result = compute_rankings_from_votes(votes)
        assert result["empathy"]["wins"] == 1
        assert result["empathy"]["rating"] > 1000
        assert result["baseline"]["losses"] == 1
        assert result["baseline"]["rating"] < 1000

    def test_single_baseline_win(self):
        votes = [{"user_vote": "model_b", "winner_type": "baseline"}]
        result = compute_rankings_from_votes(votes)
        assert result["baseline"]["wins"] == 1
        assert result["empathy"]["losses"] == 1

    def test_tie(self):
        votes = [{"user_vote": "tie", "winner_type": None}]
        result = compute_rankings_from_votes(votes)
        assert result["empathy"]["ties"] == 1
        assert result["baseline"]["ties"] == 1
        # Ratings stay near 1000 for tie between equals
        assert result["empathy"]["rating"] == pytest.approx(1000, abs=1)

    def test_both_bad_ignored(self):
        votes = [{"user_vote": "both_bad", "winner_type": None}]
        result = compute_rankings_from_votes(votes)
        assert result["empathy"]["total_battles"] == 0
        assert result["baseline"]["total_battles"] == 0

    def test_multiple_votes(self):
        votes = [
            {"user_vote": "model_a", "winner_type": "strategy"},
            {"user_vote": "model_a", "winner_type": "strategy"},
            {"user_vote": "model_b", "winner_type": "baseline"},
        ]
        result = compute_rankings_from_votes(votes)
        assert result["empathy"]["wins"] == 2
        assert result["empathy"]["losses"] == 1
        assert result["baseline"]["wins"] == 1
        assert result["baseline"]["losses"] == 2
        # With 2 wins vs 1, empathy should have higher rating
        assert result["empathy"]["rating"] > result["baseline"]["rating"]

    def test_uncertainty_decreases_with_battles(self):
        votes = [{"user_vote": "model_a", "winner_type": "strategy"} for _ in range(20)]
        result = compute_rankings_from_votes(votes)
        assert result["empathy"]["uncertainty"] < 350.0


class TestStatisticalSignificance:
    def test_insufficient_data(self):
        result = compute_statistical_significance(0, 0, 0)
        assert result["p_value"] == 1.0
        assert result["effect_label"] == "insufficient_data"
        assert result["is_significant"] is False
        assert result["confidence_level"] == "none"

    def test_one_sample_insufficient(self):
        result = compute_statistical_significance(1, 0, 0)
        assert result["is_significant"] is False

    def test_equal_wins_losses(self):
        result = compute_statistical_significance(50, 50, 0)
        assert result["p_value"] > 0.05
        assert result["is_significant"] is False

    def test_highly_significant(self):
        result = compute_statistical_significance(90, 10, 0)
        assert result["p_value"] < 0.001
        assert result["is_significant"] is True
        assert result["confidence_level"] == "very_high"
        assert result["effect_size"] > 0

    def test_wilson_ci_bounds(self):
        result = compute_statistical_significance(70, 30, 10)
        assert 0.0 <= result["wilson_ci_lower"] <= result["wilson_ci_upper"] <= 1.0

    def test_effect_size_labels(self):
        # Large effect
        result = compute_statistical_significance(95, 5, 0)
        assert result["effect_label"] in ("medium", "large")

        # Small/negligible effect
        result2 = compute_statistical_significance(52, 48, 0)
        assert result2["effect_label"] in ("negligible", "small")

    def test_sample_size_included(self):
        result = compute_statistical_significance(30, 20, 10)
        assert result["sample_size"] == 60
