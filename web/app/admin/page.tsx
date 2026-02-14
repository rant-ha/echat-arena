"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Vote,
  Users,
  MessageSquare,
  Bot,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { StatsCard } from "@/components/admin/StatsCard";
import { Skeleton, SkeletonCard } from "@/components/Skeleton";
import { Card, Button } from "@/components/ui";
import { cn } from "@/components/ui";
import { useI18n } from "@/utils/i18n-context";

interface Statistics {
  overview: {
    total_votes: number;
    total_users: number;
    active_users: number;
    total_sessions: number;
    active_models: number;
  };
  vote_distribution: {
    model_a: number;
    model_b: number;
    tie: number;
    both_bad: number;
  };
  daily_activity: Array<{
    date: string;
    votes: number;
  }>;
  period: string;
}

interface DetailedStats {
  strategy_overview: {
    total_votes: number;
    strategy_wins: number;
    baseline_wins: number;
    undecided: number;
    strategy_win_rate: number;
  };
}

type Period = "1d" | "7d" | "30d" | "all";

export default function AdminDashboardPage() {
  const { getToken } = useAdminAuth();
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const [stats, setStats] = useState<Statistics | null>(null);
  const [detailedStats, setDetailedStats] = useState<DetailedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("7d");

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    const token = getToken();
    if (!token) {
      setError(tRef.current("common.not_logged_in"));
      setLoading(false);
      return;
    }

    try {
      const [res, detailedRes] = await Promise.all([
        fetch(`/api/proxy/api/arena/admin/statistics?period=${period}`, {
          headers: { "admin-token": token },
        }),
        fetch(`/api/proxy/api/arena/admin/statistics/detailed?period=${period}`, {
          headers: { "admin-token": token },
        }),
      ]);

      const data = await res.json();

      if (data.ok) {
        setStats(data.data);
      } else {
        setError(data.error || tRef.current("admin.dashboard.fetch_error"));
      }

      const detailedData = await detailedRes.json();
      if (detailedData.ok) {
        setDetailedStats(detailedData.data);
      }
    } catch {
      setError(tRef.current("common.error"));
    } finally {
      setLoading(false);
    }
  }, [getToken, period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const maxVotes = stats
    ? Math.max(...stats.daily_activity.map((d) => d.votes), 1)
    : 1;

  const voteTotal = stats
    ? stats.vote_distribution.model_a +
      stats.vote_distribution.model_b +
      stats.vote_distribution.tie +
      stats.vote_distribution.both_bad
    : 0;

  const periodLabels: Record<Period, string> = {
    "1d": t("admin.dashboard.period_1d"),
    "7d": t("admin.dashboard.period_7d"),
    "30d": t("admin.dashboard.period_30d"),
    "all": t("admin.dashboard.period_all"),
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{t("admin.dashboard.title")}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {t("admin.dashboard.subtitle")}
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
                {periodLabels[p]}
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading && !stats ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border-faint bg-surface-secondary/70 p-6">
              <Skeleton className="h-4 w-24 mb-4" />
              <div className="space-y-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-3/4" />
              </div>
            </div>
            <div className="rounded-xl border border-border-faint bg-surface-secondary/70 p-6">
              <Skeleton className="h-4 w-24 mb-4" />
              <Skeleton className="h-48 w-full" />
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-negative">{error}</div>
        </div>
      ) : stats ? (
        <div className="space-y-6">
          {/* Overview Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title={t("admin.dashboard.total_votes")}
              value={stats.overview.total_votes.toLocaleString()}
              icon={Vote}
            />
            <StatsCard
              title={t("admin.dashboard.registered_users")}
              value={stats.overview.total_users.toLocaleString()}
              icon={Users}
              description={`${stats.overview.active_users} ${t("admin.dashboard.active")}`}
            />
            <StatsCard
              title={t("admin.dashboard.sessions")}
              value={stats.overview.total_sessions.toLocaleString()}
              icon={MessageSquare}
            />
            <StatsCard
              title={t("admin.dashboard.active_models")}
              value={stats.overview.active_models}
              icon={Bot}
            />
            {detailedStats && (
              <StatsCard
                title={t("admin.dashboard.strategy_win_rate")}
                value={`${detailedStats.strategy_overview.strategy_win_rate}%`}
                icon={TrendingUp}
                description={`${detailedStats.strategy_overview.strategy_wins} ${t("admin.dashboard.strategy")} / ${detailedStats.strategy_overview.baseline_wins} ${t("admin.dashboard.baseline")}`}
              />
            )}
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Vote Distribution */}
            <Card>
              <h2 className="mb-4 font-medium text-text-primary">{t("admin.dashboard.vote_distribution")}</h2>
              <div className="space-y-3">
                {[
                  { key: "model_a", labelKey: "vote.model_a", color: "bg-blue-500" },
                  { key: "model_b", labelKey: "vote.model_b", color: "bg-green-500" },
                  { key: "tie", labelKey: "vote.tie", color: "bg-yellow-500" },
                  { key: "both_bad", labelKey: "vote.both_bad", color: "bg-red-500" },
                ].map((item) => {
                  const count =
                    stats.vote_distribution[
                      item.key as keyof typeof stats.vote_distribution
                    ];
                  const percent = voteTotal > 0 ? (count / voteTotal) * 100 : 0;

                  return (
                    <div key={item.key}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-text-secondary">{t(item.labelKey)}</span>
                        <span className="text-text-primary">
                          {count} ({percent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
                        <div
                          className={cn("h-full transition-all", item.color)}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Daily Activity */}
            <Card>
              <h2 className="mb-4 font-medium text-text-primary">{t("admin.dashboard.daily_votes")}</h2>
              <div className="flex h-48 items-end gap-2">
                {stats.daily_activity.map((day) => (
                  <div
                    key={day.date}
                    className="flex flex-1 flex-col items-center"
                  >
                    <div className="w-full flex-1 flex flex-col justify-end">
                      <div
                        className="w-full rounded-t bg-interactive-accent transition-all hover:bg-interactive-hover"
                        style={{
                          height: `${(day.votes / maxVotes) * 100}%`,
                          minHeight: day.votes > 0 ? "4px" : "0",
                        }}
                      />
                    </div>
                    <div className="mt-2 text-xs text-text-muted">
                      {day.date.slice(5)}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {day.votes}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
