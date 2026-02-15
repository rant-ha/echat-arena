"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  RefreshCw,
  Trophy,
  Target,
  Users,
  Activity,
  Percent,
  AlertTriangle,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, Button } from "@/components/ui";
import { cn } from "@/components/ui";
import { useI18n } from "@/utils/i18n-context";
import { SkeletonCard, SkeletonTable } from "@/components/Skeleton";
import { TOOLTIP_STYLE, ACCENT, GREEN, YELLOW, RED } from "@/utils/chart-constants";

// ---------- types ----------

interface ModelPerformance {
  model: string;
  total_battles: number;
  strategy_wins: number;
  strategy_win_rate: number;
  avg_turn_count: number;
}

interface StrategyOverview {
  total_votes: number;
  strategy_wins: number;
  baseline_wins: number;
  undecided: number;
  strategy_win_rate: number;
}

interface UserFunnel {
  users_1_plus: number;
  users_5_plus: number;
  users_10_plus: number;
  users_20_plus: number;
}

interface AvgSession {
  current_avg: number;
  previous_avg: number;
  trend_pct: number;
  current_sample: number;
  previous_sample: number;
}

interface HourlyItem {
  hour: number;
  count: number;
}

interface DayOfWeekItem {
  day: number;
  count: number;
}

interface DetailedStats {
  model_performance: ModelPerformance[];
  strategy_overview: StrategyOverview;
  hourly_distribution: HourlyItem[];
  day_of_week_distribution: DayOfWeekItem[];
  user_funnel: UserFunnel;
  avg_session_length: AvgSession;
  period: string;
}

interface LeaderboardEntry {
  strategy_name: string;
  rating: number;
  uncertainty: number;
  win_rate: number;
  wins: number;
  losses: number;
  ties: number;
  total_battles: number;
}

interface LeaderboardStatistics {
  p_value: number;
  effect_size: number;
  effect_label: string;
  wilson_ci_lower: number;
  wilson_ci_upper: number;
  confidence_level: string;
  is_significant: boolean;
  sample_size: number;
}

interface LeaderboardData {
  leaderboard: LeaderboardEntry[];
  statistics: LeaderboardStatistics;
  total_votes: number;
  votes_truncated: boolean;
  period: string;
  computed_at: string;
}

type Period = "1d" | "7d" | "30d" | "all";

// ---------- constants ----------

const CONFIDENCE_COLORS: Record<string, string> = {
  very_high: "bg-green-500/15 text-green-400 border-green-500/30",
  high: "bg-green-500/15 text-green-400 border-green-500/30",
  moderate: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  low: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  none: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const DAY_LABELS_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const DAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---------- component ----------

export default function AnalyticsPage() {
  const { getToken } = useAdminAuth();
  const { locale, t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;

  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [detailed, setDetailed] = useState<DetailedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("7d");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = getToken();
    if (!token) {
      setError(tRef.current("common.not_logged_in"));
      setLoading(false);
      return;
    }
    try {
      const [lbRes, detailedRes] = await Promise.all([
        fetch(`/api/proxy/api/arena/admin/leaderboard?period=${period}`, {
          headers: { "admin-token": token },
        }),
        fetch(
          `/api/proxy/api/arena/admin/statistics/detailed?period=${period}`,
          { headers: { "admin-token": token } }
        ),
      ]);
      const [lbJson, detailedJson] = await Promise.all([
        lbRes.json(),
        detailedRes.json(),
      ]);
      if (lbJson.ok) setLeaderboard(lbJson.data);
      if (detailedJson.ok) setDetailed(detailedJson.data);
      if (!lbJson.ok && !detailedJson.ok)
        setError(tRef.current("admin.analytics.fetch_error"));
    } catch {
      setError(tRef.current("common.error"));
    } finally {
      setLoading(false);
    }
  }, [getToken, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------- derived data ----------

  const DAY_LABELS = locale === "en" ? DAY_LABELS_EN : DAY_LABELS_ZH;

  const modelWinRateData =
    detailed?.model_performance.map((m) => ({
      name: m.model,
      win_rate: m.strategy_win_rate,
    })) ?? [];

  const dowData =
    detailed?.day_of_week_distribution.map((d) => ({
      name: DAY_LABELS[d.day] ?? `${d.day}`,
      count: d.count,
    })) ?? [];

  const funnelData = detailed
    ? [
        {
          name: t("admin.stats.funnel_1"),
          value: detailed.user_funnel.users_1_plus,
        },
        {
          name: t("admin.stats.funnel_5"),
          value: detailed.user_funnel.users_5_plus,
        },
        {
          name: t("admin.stats.funnel_10"),
          value: detailed.user_funnel.users_10_plus,
        },
        {
          name: t("admin.stats.funnel_20"),
          value: detailed.user_funnel.users_20_plus,
        },
      ]
    : [];

  const sortedModels = detailed
    ? [...detailed.model_performance].sort(
        (a, b) => b.total_battles - a.total_battles
      )
    : [];

  const confidenceLabelKey = (level: string) => {
    const map: Record<string, string> = {
      very_high: "admin.leaderboard.confidence_very_high",
      high: "admin.leaderboard.confidence_high",
      moderate: "admin.leaderboard.confidence_moderate",
      low: "admin.leaderboard.confidence_low",
      none: "admin.leaderboard.confidence_none",
    };
    return map[level] || map.none;
  };

  // ---------- render ----------

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {t("admin.analytics.title")}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {t("admin.analytics.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <div className="flex rounded-lg border border-border-faint bg-surface-secondary p-1">
            {(["1d", "7d", "30d", "all"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm transition-colors",
                  period === p
                    ? "bg-interactive-accent text-white"
                    : "text-text-muted hover:text-text-primary"
                )}
              >
                {p === "1d"
                  ? t("admin.dashboard.period_1d")
                  : p === "7d"
                  ? t("admin.dashboard.period_7d")
                  : p === "30d"
                  ? t("admin.dashboard.period_30d")
                  : t("admin.dashboard.period_all")}
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={fetchData} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading && !detailed && !leaderboard ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonTable rows={5} />
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-negative">{error}</div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* -------- Key Metrics Cards -------- */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <OverviewCard
              icon={Percent}
              label={t("admin.analytics.strategy_win_rate")}
              value={
                detailed
                  ? `${detailed.strategy_overview.strategy_win_rate.toFixed(1)}%`
                  : "-"
              }
              accent={
                detailed && detailed.strategy_overview.strategy_win_rate >= 50
                  ? "text-green-400"
                  : "text-red-400"
              }
            />
            <OverviewCard
              icon={Trophy}
              label={t("admin.analytics.total_battles")}
              value={leaderboard?.total_votes ?? "-"}
            />
            <OverviewCard
              icon={Users}
              label={t("admin.analytics.active_users")}
              value={detailed?.user_funnel.users_1_plus ?? "-"}
            />
            <OverviewCard
              icon={Activity}
              label={t("admin.analytics.avg_turns")}
              value={
                detailed
                  ? detailed.avg_session_length.current_avg.toFixed(1)
                  : "-"
              }
            />
          </div>

          {/* -------- Statistical Significance -------- */}
          {leaderboard?.statistics && (
            <Card>
              <h2 className="mb-4 font-medium text-text-primary">
                {t("admin.leaderboard.significance")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-text-muted">
                    {t("admin.leaderboard.p_value")}
                  </p>
                  <p className="text-lg font-semibold text-text-primary">
                    {leaderboard.statistics.p_value.toFixed(4)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-text-muted">
                    {t("admin.leaderboard.effect_size")}
                  </p>
                  <p className="text-lg font-semibold text-text-primary">
                    {leaderboard.statistics.effect_size.toFixed(4)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-text-muted">
                    {t("admin.leaderboard.confidence_interval")}
                  </p>
                  <p className="text-lg font-semibold text-text-primary">
                    [{leaderboard.statistics.wilson_ci_lower.toFixed(3)},{" "}
                    {leaderboard.statistics.wilson_ci_upper.toFixed(3)}]
                  </p>
                </div>
                <div className="space-y-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
                      CONFIDENCE_COLORS[
                        leaderboard.statistics.confidence_level
                      ] || CONFIDENCE_COLORS.none
                    )}
                  >
                    {t(
                      confidenceLabelKey(
                        leaderboard.statistics.confidence_level
                      )
                    )}
                  </span>
                  <p
                    className={cn(
                      "text-sm font-medium",
                      leaderboard.statistics.is_significant
                        ? "text-green-400"
                        : "text-zinc-400"
                    )}
                  >
                    {leaderboard.statistics.is_significant
                      ? t("admin.leaderboard.is_significant")
                      : t("admin.leaderboard.not_significant")}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* -------- Charts 2-column grid -------- */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Win Rate by Model */}
            <Card>
              <h2 className="mb-4 font-medium text-text-primary">
                {t("admin.analytics.model_comparison")}
              </h2>
              {modelWinRateData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={modelWinRateData}>
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, 100]}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE.contentStyle}
                      cursor={TOOLTIP_STYLE.cursor}
                      formatter={(value) => [
                        `${(Number(value) || 0).toFixed(1)}%`,
                        t("admin.stats.strategy_win_rate"),
                      ]}
                    />
                    <Bar
                      dataKey="win_rate"
                      name={t("admin.stats.strategy_win_rate")}
                      fill={ACCENT}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-text-muted">
                  {t("common.no_data")}
                </div>
              )}
            </Card>

            {/* Daily Activity (Day of Week) */}
            <Card>
              <h2 className="mb-4 font-medium text-text-primary">
                {t("admin.analytics.daily_battles")}
              </h2>
              {dowData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dowData}>
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#9ca3af", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE.contentStyle}
                      cursor={TOOLTIP_STYLE.cursor}
                    />
                    <Bar
                      dataKey="count"
                      name={t("vote.votes")}
                      fill={ACCENT}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-text-muted">
                  {t("common.no_data")}
                </div>
              )}
            </Card>
          </div>

          {/* -------- User Engagement Funnel -------- */}
          {funnelData.length > 0 && (
            <Card>
              <h2 className="mb-4 font-medium text-text-primary">
                {t("admin.stats.user_funnel")}
              </h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={funnelData} layout="vertical">
                  <XAxis
                    type="number"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE.contentStyle}
                    cursor={TOOLTIP_STYLE.cursor}
                  />
                  <Bar
                    dataKey="value"
                    name={t("vote.user_count")}
                    fill={GREEN}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* -------- Model Performance Table -------- */}
          <Card>
            <h2 className="mb-4 font-medium text-text-primary">
              {t("admin.stats.model_performance")}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-faint text-left text-text-muted">
                    <th className="pb-3 pr-4 font-medium">
                      {t("admin.stats.model")}
                    </th>
                    <th className="pb-3 pr-4 font-medium text-right">
                      {t("admin.stats.total_battles")}
                    </th>
                    <th className="pb-3 pr-4 font-medium text-right">
                      {t("admin.stats.strategy_win_col")}
                    </th>
                    <th className="pb-3 pr-4 font-medium">
                      {t("admin.stats.strategy_win_rate")}
                    </th>
                    <th className="pb-3 font-medium text-right">
                      {t("admin.stats.avg_turns")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedModels.map((m) => (
                    <tr
                      key={m.model}
                      className="border-b border-border-faint/50 last:border-0"
                    >
                      <td className="py-3 pr-4 font-medium text-text-primary">
                        {m.model}
                      </td>
                      <td className="py-3 pr-4 text-right text-text-secondary">
                        {m.total_battles}
                      </td>
                      <td className="py-3 pr-4 text-right text-text-secondary">
                        {m.strategy_wins}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-elevated">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${m.strategy_win_rate}%`,
                                background:
                                  m.strategy_win_rate >= 60
                                    ? GREEN
                                    : m.strategy_win_rate >= 40
                                    ? YELLOW
                                    : RED,
                              }}
                            />
                          </div>
                          <span
                            className={cn(
                              "text-xs font-medium",
                              m.strategy_win_rate >= 60
                                ? "text-green-400"
                                : m.strategy_win_rate >= 40
                                ? "text-yellow-400"
                                : "text-red-400"
                            )}
                          >
                            {m.strategy_win_rate.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-right text-text-secondary">
                        {m.avg_turn_count.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                  {sortedModels.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-text-muted"
                      >
                        {t("common.no_data")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------- helper component ----------

function OverviewCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border-faint bg-surface-secondary p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-muted">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-interactive-accent/10">
          <Icon className="h-5 w-5 text-interactive-accent" />
        </div>
      </div>
      <p
        className={cn(
          "mt-3 text-3xl font-semibold",
          accent ?? "text-text-primary"
        )}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
