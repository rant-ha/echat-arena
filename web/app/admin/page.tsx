"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Card, Button } from "@/components/ui";
import { cn } from "@/components/ui";

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

type Period = "1d" | "7d" | "30d" | "all";

export default function AdminDashboardPage() {
  const { getToken } = useAdminAuth();
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("7d");

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    const token = getToken();
    if (!token) {
      setError("未登录");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/proxy/api/arena/admin/statistics?period=${period}`,
        {
          headers: {
            "admin-token": token,
          },
        }
      );

      const data = await res.json();

      if (data.ok) {
        setStats(data.data);
      } else {
        setError(data.error || "获取统计数据失败");
      }
    } catch {
      setError("网络错误");
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

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">仪表板</h1>
          <p className="mt-1 text-sm text-text-muted">
            系统运行状态概览
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
                  ? "24小时"
                  : p === "7d"
                  ? "7天"
                  : p === "30d"
                  ? "30天"
                  : "全部"}
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
        <div className="flex h-64 items-center justify-center">
          <div className="text-text-muted">加载中...</div>
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
              title="总投票数"
              value={stats.overview.total_votes.toLocaleString()}
              icon={Vote}
            />
            <StatsCard
              title="注册用户"
              value={stats.overview.total_users.toLocaleString()}
              icon={Users}
              description={`${stats.overview.active_users} 活跃`}
            />
            <StatsCard
              title="会话数"
              value={stats.overview.total_sessions.toLocaleString()}
              icon={MessageSquare}
            />
            <StatsCard
              title="活跃模型"
              value={stats.overview.active_models}
              icon={Bot}
            />
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Vote Distribution */}
            <Card>
              <h2 className="mb-4 font-medium text-text-primary">投票分布</h2>
              <div className="space-y-3">
                {[
                  { key: "model_a", label: "选了 A", color: "bg-blue-500" },
                  { key: "model_b", label: "选了 B", color: "bg-green-500" },
                  { key: "tie", label: "平局", color: "bg-yellow-500" },
                  { key: "both_bad", label: "都不行", color: "bg-red-500" },
                ].map((item) => {
                  const count =
                    stats.vote_distribution[
                      item.key as keyof typeof stats.vote_distribution
                    ];
                  const percent = voteTotal > 0 ? (count / voteTotal) * 100 : 0;

                  return (
                    <div key={item.key}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-text-secondary">{item.label}</span>
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
              <h2 className="mb-4 font-medium text-text-primary">每日投票</h2>
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
