"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  RefreshCw,
  Trophy,
  Target,
  ShieldX,
  Percent,
  TrendingUp,
  TrendingDown,
  Clock,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, Button } from "@/components/ui";
import { cn } from "@/components/ui";
import { useI18n } from "@/utils/i18n-context";
import { TOOLTIP_STYLE, ACCENT, GREEN, YELLOW, RED, BLUE, PIE_COLORS } from "@/utils/chart-constants";

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

interface HourlyItem {
  hour: number;
  count: number;
}

interface DayOfWeekItem {
  day: number;
  count: number;
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

interface TopPrompt {
  prompt_prefix: string;
  count: number;
}

interface DetailedStats {
  model_performance: ModelPerformance[];
  strategy_overview: StrategyOverview;
  hourly_distribution: HourlyItem[];
  day_of_week_distribution: DayOfWeekItem[];
  user_funnel: UserFunnel;
  avg_session_length: AvgSession;
  top_prompts: TopPrompt[];
  period: string;
}

interface VoteDistribution {
  model_a: number;
  model_b: number;
  tie: number;
  both_bad: number;
}

type Period = "1d" | "7d" | "30d" | "all";

// ---------- constants ----------

const DAY_LABELS_ZH = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const DAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];


// ---------- component ----------

export default function StatisticsPage() {
  const { getToken } = useAdminAuth();
  const { locale, t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const [detailed, setDetailed] = useState<DetailedStats | null>(null);
  const [voteDist, setVoteDist] = useState<VoteDistribution | null>(null);
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

    const headers = { "admin-token": token };

    try {
      const [detailedRes, simpleRes] = await Promise.all([
        fetch(
          `/api/proxy/api/arena/admin/statistics/detailed?period=${period}`,
          { headers }
        ),
        fetch(`/api/proxy/api/arena/admin/statistics?period=${period}`, {
          headers,
        }),
      ]);

      const detailedJson = await detailedRes.json();
      const simpleJson = await simpleRes.json();

      if (detailedJson.ok) {
        setDetailed(detailedJson.data);
      } else {
        setError(detailedJson.error || tRef.current("admin.stats.fetch_error"));
      }

      if (simpleJson.ok && simpleJson.data?.vote_distribution) {
        setVoteDist(simpleJson.data.vote_distribution);
      }
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

  const hourlyData =
    detailed?.hourly_distribution.map((h) => ({
      name: `${h.hour}${locale === "en" ? "h" : "\u65f6"}`,
      count: h.count,
    })) ?? [];

  const dowData =
    detailed?.day_of_week_distribution.map((d) => ({
      name: DAY_LABELS[d.day] ?? `${d.day}`,
      count: d.count,
    })) ?? [];

  const funnelData = detailed
    ? [
        { name: t("admin.stats.funnel_1"), value: detailed.user_funnel.users_1_plus },
        { name: t("admin.stats.funnel_5"), value: detailed.user_funnel.users_5_plus },
        { name: t("admin.stats.funnel_10"), value: detailed.user_funnel.users_10_plus },
        { name: t("admin.stats.funnel_20"), value: detailed.user_funnel.users_20_plus },
      ]
    : [];

  const promptData =
    detailed?.top_prompts.map((p) => ({
      name:
        p.prompt_prefix.length > 30
          ? p.prompt_prefix.slice(0, 30) + "..."
          : p.prompt_prefix,
      count: p.count,
    })) ?? [];

  const pieData = voteDist
    ? [
        { name: t("vote.model_a"), value: voteDist.model_a },
        { name: t("vote.model_b"), value: voteDist.model_b },
        { name: t("vote.tie"), value: voteDist.tie },
        { name: t("vote.both_bad"), value: voteDist.both_bad },
      ]
    : [];

  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const sortedModels = detailed
    ? [...detailed.model_performance].sort(
        (a, b) => b.total_battles - a.total_battles
      )
    : [];

  // ---------- render ----------

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {t("admin.stats.title")}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {t("admin.stats.subtitle")}
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
      {loading && !detailed ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-text-muted">{t("common.loading")}</div>
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-negative">{error}</div>
        </div>
      ) : detailed ? (
        <div className="space-y-6">
          {/* -------- Strategy Overview Cards -------- */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <OverviewCard
              icon={Target}
              label={t("admin.stats.total_votes")}
              value={detailed.strategy_overview.total_votes}
            />
            <OverviewCard
              icon={Trophy}
              label={t("admin.stats.strategy_wins")}
              value={detailed.strategy_overview.strategy_wins}
              accent="text-green-400"
            />
            <OverviewCard
              icon={ShieldX}
              label={t("admin.stats.baseline_wins")}
              value={detailed.strategy_overview.baseline_wins}
              accent="text-red-400"
            />
            <OverviewCard
              icon={Percent}
              label={t("admin.stats.win_rate")}
              value={`${detailed.strategy_overview.strategy_win_rate.toFixed(1)}%`}
              accent={
                detailed.strategy_overview.strategy_win_rate >= 50
                  ? "text-green-400"
                  : "text-red-400"
              }
            />
          </div>

          {/* -------- Charts 2-column grid -------- */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Hourly Activity */}
            <Card>
              <h2 className="mb-4 font-medium text-text-primary">
                {t("admin.stats.hourly_activity")}
              </h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={hourlyData}>
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
            </Card>

            {/* Day of Week */}
            <Card>
              <h2 className="mb-4 font-medium text-text-primary">
                {t("admin.stats.day_of_week")}
              </h2>
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
            </Card>

            {/* User Engagement Funnel */}
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

            {/* Vote Distribution Pie */}
            <Card>
              <h2 className="mb-4 font-medium text-text-primary">{t("admin.stats.vote_distribution")}</h2>
              {voteDist ? (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="55%" height={250}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE.contentStyle}
                        formatter={(value, name) => {
                          const v = Number(value) || 0;
                          return [
                            `${v} (${pieTotal > 0 ? ((v / pieTotal) * 100).toFixed(1) : 0}%)`,
                            name,
                          ];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {pieData.map((d, i) => (
                      <div
                        key={d.name}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-sm"
                            style={{ background: PIE_COLORS[i] }}
                          />
                          <span className="text-text-secondary">{d.name}</span>
                        </div>
                        <span className="font-medium text-text-primary">
                          {d.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-text-muted">
                  {t("common.no_data")}
                </div>
              )}
            </Card>

            {/* Average Session Length */}
            <Card>
              <h2 className="mb-4 font-medium text-text-primary">
                {t("admin.stats.avg_session")}
              </h2>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-4xl font-bold text-text-primary">
                    {detailed.avg_session_length.current_avg.toFixed(1)}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    {t("admin.stats.turns_per_session")} (n={detailed.avg_session_length.current_sample})
                  </p>
                </div>
                <div className="flex flex-col items-start gap-1">
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium",
                      detailed.avg_session_length.trend_pct >= 0
                        ? "bg-green-500/10 text-green-400"
                        : "bg-red-500/10 text-red-400"
                    )}
                  >
                    {detailed.avg_session_length.trend_pct >= 0 ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    {Math.abs(detailed.avg_session_length.trend_pct).toFixed(1)}%
                  </div>
                  <p className="text-xs text-text-muted">
                    {t("admin.stats.prev_period")}: {detailed.avg_session_length.previous_avg.toFixed(1)} (n={detailed.avg_session_length.previous_sample})
                  </p>
                </div>
              </div>
            </Card>

            {/* Placeholder card for grid alignment when odd number of charts above table */}
            <Card className="flex items-center justify-center">
              <div className="text-center">
                <Clock className="mx-auto mb-2 h-8 w-8 text-text-muted" />
                <p className="text-sm text-text-muted">
                  {t("admin.stats.data_refreshed")}{" "}
                  {new Date().toLocaleTimeString(locale === "en" ? "en-US" : "zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </Card>
          </div>

          {/* -------- Model Performance Table -------- */}
          <Card>
            <h2 className="mb-4 font-medium text-text-primary">
              {t("admin.stats.model_performance")}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-faint text-left text-text-muted">
                    <th className="pb-3 pr-4 font-medium">{t("admin.stats.model")}</th>
                    <th className="pb-3 pr-4 font-medium text-right">
                      {t("admin.stats.total_battles")}
                    </th>
                    <th className="pb-3 pr-4 font-medium text-right">
                      {t("admin.stats.strategy_win_col")}
                    </th>
                    <th className="pb-3 pr-4 font-medium">{t("admin.stats.strategy_win_rate")}</th>
                    <th className="pb-3 font-medium text-right">{t("admin.stats.avg_turns")}</th>
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

          {/* -------- Top Prompts -------- */}
          {promptData.length > 0 && (
            <Card>
              <h2 className="mb-4 font-medium text-text-primary">
                {t("admin.stats.top_prompts")}
              </h2>
              <ResponsiveContainer width="100%" height={Math.max(250, promptData.length * 36)}>
                <BarChart data={promptData} layout="vertical" margin={{ left: 20 }}>
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
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={200}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE.contentStyle}
                    cursor={TOOLTIP_STYLE.cursor}
                  />
                  <Bar
                    dataKey="count"
                    name={t("vote.usage_count")}
                    fill={ACCENT}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      ) : null}
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
