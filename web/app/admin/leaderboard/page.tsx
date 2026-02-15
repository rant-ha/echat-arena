"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  RefreshCw,
  Target,
  Users,
  AlertTriangle,
  Calculator,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, Button } from "@/components/ui";
import { cn } from "@/components/ui";
import { useI18n } from "@/utils/i18n-context";
import { SkeletonCard, SkeletonTable } from "@/components/Skeleton";
import { GREEN, YELLOW, RED, CONFIDENCE_COLORS, confidenceLabelKey } from "@/utils/chart-constants";
import { StatsCard } from "@/components/admin/StatsCard";
import type { LeaderboardData, Period } from "@/types/admin";

// ---------- component ----------

export default function LeaderboardPage() {
  const { getToken } = useAdminAuth();
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;

  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("7d");
  const [computing, setComputing] = useState(false);
  const [computeMsg, setComputeMsg] = useState<string | null>(null);

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
      const res = await fetch(
        `/api/proxy/api/arena/admin/leaderboard?period=${period}`,
        { headers: { "admin-token": token } }
      );
      const json = await res.json();
      if (json.ok) {
        setData(json.data);
      } else {
        setError(json.error || tRef.current("admin.leaderboard.fetch_error"));
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

  const handleRecompute = async () => {
    setComputing(true);
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/proxy/api/arena/admin/rankings/compute", {
        method: "POST",
        headers: { "admin-token": token },
      });
      const json = await res.json();
      if (json.ok) {
        setComputeMsg(t("admin.leaderboard.compute_success"));
        fetchData();
      } else {
        setComputeMsg(json.error || t("admin.leaderboard.compute_error"));
      }
    } catch {
      setComputeMsg(t("admin.leaderboard.compute_error"));
    } finally {
      setComputing(false);
      setTimeout(() => setComputeMsg(null), 3000);
    }
  };

  // ---------- render ----------

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {t("admin.leaderboard.title")}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {t("admin.leaderboard.subtitle")}
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
          {/* Recompute */}
          <Button variant="primary" onClick={handleRecompute} disabled={computing}>
            <Calculator className={cn("mr-2 h-4 w-4", computing && "animate-spin")} />
            {computing
              ? t("admin.leaderboard.computing")
              : t("admin.leaderboard.recompute")}
          </Button>
          {/* Refresh */}
          <Button variant="ghost" onClick={fetchData} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Compute feedback */}
      {computeMsg && (
        <div className="mb-4 rounded-lg border border-border-faint bg-surface-secondary px-4 py-2 text-sm text-text-secondary">
          {computeMsg}
        </div>
      )}

      {/* Content */}
      {loading && !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonTable rows={5} />
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-negative">{error}</div>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <StatsCard
              icon={Target}
              title={t("admin.leaderboard.total_votes")}
              value={data.total_votes}
            />
            <StatsCard
              icon={Users}
              title={t("admin.leaderboard.strategies")}
              value={data.leaderboard.length}
            />
          </div>

          {/* Votes Truncated Warning */}
          {data.votes_truncated && (
            <div className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-yellow-400" />
              <p className="text-sm text-yellow-300">
                {t("admin.leaderboard.votes_truncated")}
              </p>
            </div>
          )}

          {/* Statistical Significance */}
          {data.statistics && (
            <Card>
              <h2 className="mb-4 font-medium text-text-primary">
                {t("admin.leaderboard.significance")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* P-value */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-text-muted">
                    {t("admin.leaderboard.p_value")}
                  </p>
                  <p className="text-lg font-semibold text-text-primary">
                    {data.statistics.p_value.toFixed(4)}
                  </p>
                </div>
                {/* Effect Size */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-text-muted">
                    {t("admin.leaderboard.effect_size")}
                  </p>
                  <p className="text-lg font-semibold text-text-primary">
                    {data.statistics.effect_size.toFixed(4)}
                  </p>
                </div>
                {/* Confidence Interval */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-text-muted">
                    {t("admin.leaderboard.confidence_interval")}
                  </p>
                  <p className="text-lg font-semibold text-text-primary">
                    [{data.statistics.wilson_ci_lower.toFixed(3)},{" "}
                    {data.statistics.wilson_ci_upper.toFixed(3)}]
                  </p>
                </div>
                {/* Confidence Level + Significance */}
                <div className="space-y-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
                      CONFIDENCE_COLORS[data.statistics.confidence_level] ||
                        CONFIDENCE_COLORS.none
                    )}
                  >
                    {t(confidenceLabelKey(data.statistics.confidence_level))}
                  </span>
                  <p
                    className={cn(
                      "text-sm font-medium",
                      data.statistics.is_significant
                        ? "text-green-400"
                        : "text-zinc-400"
                    )}
                  >
                    {data.statistics.is_significant
                      ? t("admin.leaderboard.is_significant")
                      : t("admin.leaderboard.not_significant")}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Rankings Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-faint text-left text-text-muted">
                    <th className="pb-3 pr-4 font-medium">
                      {t("admin.leaderboard.rank")}
                    </th>
                    <th className="pb-3 pr-4 font-medium">
                      {t("admin.leaderboard.strategy")}
                    </th>
                    <th className="pb-3 pr-4 font-medium text-right">
                      {t("admin.leaderboard.rating")}
                    </th>
                    <th className="pb-3 pr-4 font-medium">
                      {t("admin.leaderboard.win_rate")}
                    </th>
                    <th className="pb-3 pr-4 font-medium text-right">
                      {t("admin.leaderboard.wins")}
                    </th>
                    <th className="pb-3 pr-4 font-medium text-right">
                      {t("admin.leaderboard.losses")}
                    </th>
                    <th className="pb-3 pr-4 font-medium text-right">
                      {t("admin.leaderboard.ties")}
                    </th>
                    <th className="pb-3 font-medium text-right">
                      {t("admin.leaderboard.total_battles")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.map((item, idx) => (
                    <tr
                      key={item.strategy_name}
                      className="border-b border-border-faint/50 last:border-0"
                    >
                      <td className="py-3 pr-4 text-text-muted">#{idx + 1}</td>
                      <td className="py-3 pr-4 font-medium text-text-primary">
                        {item.strategy_name}
                      </td>
                      <td className="py-3 pr-4 text-right text-text-secondary">
                        {item.rating.toFixed(0)}
                        <span className="ml-1 text-xs text-text-muted">
                          &plusmn;{item.uncertainty.toFixed(0)}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-elevated">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${item.win_rate}%`,
                                background:
                                  item.win_rate >= 60
                                    ? GREEN
                                    : item.win_rate >= 40
                                    ? YELLOW
                                    : RED,
                              }}
                            />
                          </div>
                          <span
                            className={cn(
                              "text-xs font-medium",
                              item.win_rate >= 60
                                ? "text-green-400"
                                : item.win_rate >= 40
                                ? "text-yellow-400"
                                : "text-red-400"
                            )}
                          >
                            {item.win_rate.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right text-green-400">
                        {item.wins}
                      </td>
                      <td className="py-3 pr-4 text-right text-red-400">
                        {item.losses}
                      </td>
                      <td className="py-3 pr-4 text-right text-text-muted">
                        {item.ties}
                      </td>
                      <td className="py-3 text-right text-text-secondary">
                        {item.total_battles}
                      </td>
                    </tr>
                  ))}
                  {data.leaderboard.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
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
      ) : null}
    </div>
  );
}
