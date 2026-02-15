"""Bradley-Terry inspired ranking service.

NOTE: This is a simplified Elo-like implementation using logistic functions,
NOT a full Bradley-Terry MLE. Good enough for small-scale strategy comparison.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


# ── Constants ──────────────────────────────────────────────────────────
DEFAULT_RATING = 1000.0
DEFAULT_UNCERTAINTY = 350.0
K_FACTOR = 32.0  # Standard Elo K-factor
SCALE_FACTOR = 400.0  # Logistic scale


class BradleyTerryModel:
    """Simplified Elo-like rating model using logistic functions."""

    def __init__(
        self,
        k_factor: float = K_FACTOR,
        scale_factor: float = SCALE_FACTOR,
        default_rating: float = DEFAULT_RATING,
    ):
        self.k_factor = k_factor
        self.scale_factor = scale_factor
        self.default_rating = default_rating

    def expected_score(self, rating_a: float, rating_b: float) -> float:
        """Calculate expected score for player A against player B."""
        return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / self.scale_factor))

    def update_ratings(
        self,
        rating_a: float,
        rating_b: float,
        result: float,  # 1.0 = A wins, 0.0 = B wins, 0.5 = tie
    ) -> Tuple[float, float]:
        """Update ratings based on match result. Returns (new_a, new_b)."""
        expected_a = self.expected_score(rating_a, rating_b)
        expected_b = 1.0 - expected_a

        new_a = rating_a + self.k_factor * (result - expected_a)
        new_b = rating_b + self.k_factor * ((1.0 - result) - expected_b)

        return round(new_a, 2), round(new_b, 2)


def compute_rankings_from_votes(
    votes: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """
    Compute strategy rankings from vote records.

    Each vote should have:
    - user_vote: "model_a" | "model_b" | "tie" | "both_bad"
    - winner_type: "strategy" | "baseline" | None

    Returns dict keyed by strategy_name with rating, uncertainty, wins, losses, ties, total_battles.
    """
    model = BradleyTerryModel()

    strategies = {
        "empathy": {
            "rating": DEFAULT_RATING,
            "uncertainty": DEFAULT_UNCERTAINTY,
            "wins": 0,
            "losses": 0,
            "ties": 0,
            "total_battles": 0,
        },
        "baseline": {
            "rating": DEFAULT_RATING,
            "uncertainty": DEFAULT_UNCERTAINTY,
            "wins": 0,
            "losses": 0,
            "ties": 0,
            "total_battles": 0,
        },
    }

    for vote in votes:
        user_vote = vote.get("user_vote", "")
        winner_type = vote.get("winner_type")

        # Skip "both_bad" - no useful signal
        if user_vote == "both_bad":
            continue

        if user_vote == "tie":
            # Tie: both get 0.5
            strategies["empathy"]["ties"] += 1
            strategies["baseline"]["ties"] += 1
            strategies["empathy"]["total_battles"] += 1
            strategies["baseline"]["total_battles"] += 1

            new_emp, new_base = model.update_ratings(
                strategies["empathy"]["rating"],
                strategies["baseline"]["rating"],
                0.5,
            )
            strategies["empathy"]["rating"] = new_emp
            strategies["baseline"]["rating"] = new_base

        elif winner_type == "strategy":
            # Strategy (empathy) wins
            strategies["empathy"]["wins"] += 1
            strategies["baseline"]["losses"] += 1
            strategies["empathy"]["total_battles"] += 1
            strategies["baseline"]["total_battles"] += 1

            new_emp, new_base = model.update_ratings(
                strategies["empathy"]["rating"],
                strategies["baseline"]["rating"],
                1.0,
            )
            strategies["empathy"]["rating"] = new_emp
            strategies["baseline"]["rating"] = new_base

        elif winner_type == "baseline":
            # Baseline wins
            strategies["baseline"]["wins"] += 1
            strategies["empathy"]["losses"] += 1
            strategies["empathy"]["total_battles"] += 1
            strategies["baseline"]["total_battles"] += 1

            new_emp, new_base = model.update_ratings(
                strategies["empathy"]["rating"],
                strategies["baseline"]["rating"],
                0.0,
            )
            strategies["empathy"]["rating"] = new_emp
            strategies["baseline"]["rating"] = new_base

    # Round final ratings
    for s in strategies.values():
        s["rating"] = round(s["rating"], 2)
        # Reduce uncertainty with more battles (simple decay)
        battles = s["total_battles"]
        if battles > 0:
            s["uncertainty"] = round(
                DEFAULT_UNCERTAINTY / math.sqrt(1 + battles / 10.0), 2
            )
        s["computed_at"] = datetime.utcnow().isoformat() + "Z"

    return strategies


def compute_statistical_significance(
    wins: int, losses: int, ties: int
) -> Dict[str, Any]:
    """
    Compute statistical significance metrics for strategy vs baseline.

    Returns p_value, effect_size (Cohen's h), wilson_ci, and is_significant.
    Uses normal approximation (no scipy needed).
    """
    total = wins + losses + ties
    if total < 2:
        return {
            "p_value": 1.0,
            "effect_size": 0.0,
            "effect_label": "insufficient_data",
            "wilson_ci_lower": 0.0,
            "wilson_ci_upper": 1.0,
            "is_significant": False,
            "confidence_level": "none",
            "sample_size": total,
        }

    # Win rate (excluding ties for direct comparison)
    decided = wins + losses
    if decided < 2:
        return {
            "p_value": 1.0,
            "effect_size": 0.0,
            "effect_label": "insufficient_data",
            "wilson_ci_lower": 0.0,
            "wilson_ci_upper": 1.0,
            "is_significant": False,
            "confidence_level": "none",
            "sample_size": total,
        }

    p_hat = wins / decided  # observed win rate
    p_0 = 0.5  # null hypothesis: 50/50

    # ── Z-test for proportion ──
    se = math.sqrt(p_0 * (1 - p_0) / decided)
    z = (p_hat - p_0) / se if se > 0 else 0.0

    # Two-tailed p-value using error function
    p_value = 2.0 * (1.0 - 0.5 * (1.0 + math.erf(abs(z) / math.sqrt(2.0))))
    p_value = round(min(max(p_value, 0.0), 1.0), 6)

    # ── Cohen's h (effect size for proportions) ──
    def _arcsin_transform(p: float) -> float:
        p = max(0.0, min(1.0, p))
        return 2.0 * math.asin(math.sqrt(p))

    h = abs(_arcsin_transform(p_hat) - _arcsin_transform(p_0))
    h = round(h, 4)

    # Effect size label
    if h < 0.2:
        effect_label = "negligible"
    elif h < 0.5:
        effect_label = "small"
    elif h < 0.8:
        effect_label = "medium"
    else:
        effect_label = "large"

    # ── Wilson score confidence interval (95%) ──
    z_95 = 1.96
    denominator = 1.0 + z_95 ** 2 / decided
    center = (p_hat + z_95 ** 2 / (2 * decided)) / denominator
    margin = (z_95 * math.sqrt(p_hat * (1 - p_hat) / decided + z_95 ** 2 / (4 * decided ** 2))) / denominator

    wilson_lower = round(max(0.0, center - margin), 4)
    wilson_upper = round(min(1.0, center + margin), 4)

    # Significance and confidence
    is_significant = p_value < 0.05
    if p_value < 0.001:
        confidence_level = "very_high"
    elif p_value < 0.01:
        confidence_level = "high"
    elif p_value < 0.05:
        confidence_level = "moderate"
    elif p_value < 0.1:
        confidence_level = "low"
    else:
        confidence_level = "none"

    return {
        "p_value": p_value,
        "effect_size": h,
        "effect_label": effect_label,
        "wilson_ci_lower": wilson_lower,
        "wilson_ci_upper": wilson_upper,
        "is_significant": is_significant,
        "confidence_level": confidence_level,
        "sample_size": total,
    }
