"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare,
  MoreVertical,
  Trash2,
  RotateCcw,
  RefreshCw,
  Clock,
  Trash,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card } from "@/components/ui";
import { cn } from "@/components/ui";

interface Session {
  session_id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  deleted_at: string | null;
  turn_count: number;
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN");
}

function isExpired(expiresAt: string) {
  return new Date(expiresAt) < new Date();
}

export default function SessionsPage() {
  const { getToken } = useAdminAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);

    const token = getToken();
    if (!token) {
      setError("未登录");
      setLoading(false);
      return;
    }

    try {
      // Note: The existing API uses POST and admin_key header, not admin-token
      // We need to use the existing admin API key approach
      const adminKey = token; // Use admin token as key for now

      const res = await fetch("/api/proxy/api/arena/sessions/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "admin-token": adminKey,
        },
        body: JSON.stringify({
          page: 1,
          page_size: 100,
          include_deleted: includeDeleted,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSessions(data.sessions || []);
      } else {
        setError(data.detail || "获取会话列表失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [getToken, includeDeleted]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleDelete = async (sessionId: string) => {
    if (!confirm("确定要删除这个会话吗？")) {
      return;
    }

    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch("/api/proxy/api/arena/session/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "admin-token": token,
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const data = await res.json();

      if (data.success) {
        fetchSessions();
      } else {
        alert(data.detail || "删除失败");
      }
    } catch {
      alert("网络错误");
    }

    setActionMenuId(null);
  };

  const handleRestore = async (sessionId: string) => {
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch("/api/proxy/api/arena/session/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "admin-token": token,
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const data = await res.json();

      if (data.success) {
        fetchSessions();
      } else {
        alert(data.detail || "恢复失败");
      }
    } catch {
      alert("网络错误");
    }

    setActionMenuId(null);
  };

  const handleCleanup = async () => {
    if (!confirm("确定要清理所有过期的已删除会话吗？此操作不可恢复。")) {
      return;
    }

    const token = getToken();
    if (!token) return;

    setCleanupLoading(true);

    try {
      const res = await fetch("/api/proxy/api/arena/sessions/cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "admin-token": token,
        },
        body: JSON.stringify({ max_age_days: 7 }),
      });

      const data = await res.json();

      if (data.success) {
        alert(`已清理 ${data.deleted_count} 个会话`);
        fetchSessions();
      } else {
        alert(data.detail || "清理失败");
      }
    } catch {
      alert("网络错误");
    } finally {
      setCleanupLoading(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">会话管理</h1>
          <p className="mt-1 text-sm text-text-muted">
            查看和管理用户对话会话
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={handleCleanup}
            disabled={cleanupLoading}
          >
            <Trash className="mr-2 h-4 w-4" />
            清理过期
          </Button>
          <Button variant="ghost" onClick={fetchSessions} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => setIncludeDeleted(e.target.checked)}
            className="rounded border-border"
          />
          显示已删除会话
        </label>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-text-muted">加载中...</div>
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-negative">{error}</div>
        </div>
      ) : sessions.length === 0 ? (
        <Card className="flex h-64 flex-col items-center justify-center">
          <MessageSquare className="h-12 w-12 text-text-muted" />
          <p className="mt-4 text-text-muted">暂无会话</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const expired = isExpired(session.expires_at);
            const deleted = !!session.deleted_at;

            return (
              <Card
                key={session.session_id}
                className={cn(
                  "flex items-center gap-4 p-4",
                  (deleted || expired) && "opacity-60"
                )}
              >
                {/* Icon */}
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    deleted
                      ? "bg-negative/10"
                      : expired
                      ? "bg-surface-elevated"
                      : "bg-interactive-accent/10"
                  )}
                >
                  <MessageSquare
                    className={cn(
                      "h-5 w-5",
                      deleted
                        ? "text-negative"
                        : expired
                        ? "text-text-muted"
                        : "text-interactive-accent"
                    )}
                  />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-sm text-text-primary truncate">
                      {session.session_id}
                    </h3>
                    {deleted && (
                      <span className="rounded bg-negative/10 px-2 py-0.5 text-xs text-negative">
                        已删除
                      </span>
                    )}
                    {!deleted && expired && (
                      <span className="rounded bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
                        已过期
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-text-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      创建: {formatDate(session.created_at)}
                    </span>
                    <span>对话轮次: {session.turn_count}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="relative">
                  <button
                    onClick={() =>
                      setActionMenuId(
                        actionMenuId === session.session_id
                          ? null
                          : session.session_id
                      )
                    }
                    className="rounded p-2 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>

                  {actionMenuId === session.session_id && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setActionMenuId(null)}
                      />
                      <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-border-faint bg-surface-secondary p-1 shadow-lg">
                        {deleted ? (
                          <button
                            onClick={() => handleRestore(session.session_id)}
                            className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-positive hover:bg-positive/10"
                          >
                            <RotateCcw className="h-4 w-4" />
                            恢复
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDelete(session.session_id)}
                            className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-negative hover:bg-negative/10"
                          >
                            <Trash2 className="h-4 w-4" />
                            删除
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
