// Shared chart constants used across admin statistics, leaderboard, and analytics pages.

export const TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--color-surface-secondary, #1a1a2e)",
    border: "1px solid var(--color-border-faint, #333)",
    borderRadius: "8px",
    color: "#e5e7eb",
  },
  cursor: { fill: "rgba(99,102,241,0.08)" },
};

export const ACCENT = "#6366f1";
export const GREEN = "#22c55e";
export const YELLOW = "#eab308";
export const RED = "#ef4444";
export const BLUE = "#3b82f6";

export const PIE_COLORS = [BLUE, GREEN, YELLOW, RED];

export const CONFIDENCE_COLORS: Record<string, string> = {
  very_high: "bg-green-500/15 text-green-400 border-green-500/30",
  high: "bg-green-500/15 text-green-400 border-green-500/30",
  moderate: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  low: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  none: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

export function confidenceLabelKey(level: string): string {
  const map: Record<string, string> = {
    very_high: "admin.leaderboard.confidence_very_high",
    high: "admin.leaderboard.confidence_high",
    moderate: "admin.leaderboard.confidence_moderate",
    low: "admin.leaderboard.confidence_low",
    none: "admin.leaderboard.confidence_none",
  };
  return map[level] || map.none;
}
