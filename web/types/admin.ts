// Shared admin type definitions — used by leaderboard, analytics, and statistics pages.

export interface LeaderboardEntry {
  strategy_name: string;
  rating: number;
  uncertainty: number;
  win_rate: number;
  wins: number;
  losses: number;
  ties: number;
  total_battles: number;
}

export interface LeaderboardStatistics {
  p_value: number;
  effect_size: number;
  effect_label: string;
  wilson_ci_lower: number;
  wilson_ci_upper: number;
  confidence_level: string;
  is_significant: boolean;
  sample_size: number;
}

export interface LeaderboardData {
  leaderboard: LeaderboardEntry[];
  statistics: LeaderboardStatistics;
  total_votes: number;
  votes_truncated: boolean;
  period: string;
  computed_at: string;
}

export type Period = "1d" | "7d" | "30d" | "all";

// ---------- detailed statistics types ----------

export interface ModelPerformance {
  model: string;
  total_battles: number;
  strategy_wins: number;
  strategy_win_rate: number;
  avg_turn_count: number;
}

export interface StrategyOverview {
  total_votes: number;
  strategy_wins: number;
  baseline_wins: number;
  undecided: number;
  strategy_win_rate: number;
}

export interface UserFunnel {
  users_1_plus: number;
  users_5_plus: number;
  users_10_plus: number;
  users_20_plus: number;
}

export interface AvgSession {
  current_avg: number;
  previous_avg: number;
  trend_pct: number;
  current_sample: number;
  previous_sample: number;
}

export interface HourlyItem {
  hour: number;
  count: number;
}

export interface DayOfWeekItem {
  day: number;
  count: number;
}

export interface TopPrompt {
  prompt_prefix: string;
  count: number;
}

export interface DetailedStats {
  model_performance: ModelPerformance[];
  strategy_overview: StrategyOverview;
  hourly_distribution: HourlyItem[];
  day_of_week_distribution: DayOfWeekItem[];
  user_funnel: UserFunnel;
  avg_session_length: AvgSession;
  top_prompts?: TopPrompt[];
  period: string;
}

export interface VoteDistribution {
  model_a: number;
  model_b: number;
  tie: number;
  both_bad: number;
}
