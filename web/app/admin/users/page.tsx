"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  Search,
  MoreVertical,
  UserX,
  UserCheck,
  History,
  RefreshCw,
  Calendar,
  Vote,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, Input } from "@/components/ui";
import { cn } from "@/components/ui";

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  vote_count: number;
  is_disabled: boolean;
}

interface Vote {
  id: string;
  created_at: string;
  prompt: string;
  user_vote: string;
  turn_count: number;
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN");
}

function voteLabel(v: string | null): string {
  if (!v) return "未投票";
  if (v === "model_a") return "选了 A";
  if (v === "model_b") return "选了 B";
  if (v === "tie") return "平局";
  if (v === "both_bad") return "都不行";
  return v;
}

export default function UsersPage() {
  const { getToken } = useAdminAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  // Vote history modal
  const [showVotes, setShowVotes] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [votesLoading, setVotesLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const token = getToken();
    if (!token) {
      setError("未登录");
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({
        page: "1",
        page_size: "100",
      });
      if (search) {
        params.set("search", search);
      }

      const res = await fetch(`/api/proxy/api/arena/admin/users?${params}`, {
        headers: {
          "admin-token": token,
        },
      });

      const data = await res.json();

      if (data.ok) {
        setUsers(data.data.users || []);
      } else {
        setError(data.error || "获取用户列表失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [getToken, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleToggleDisabled = async (user: User) => {
    const token = getToken();
    if (!token) return;

    const endpoint = user.is_disabled ? "enable" : "disable";

    try {
      const res = await fetch(
        `/api/proxy/api/arena/admin/users/${user.id}/${endpoint}`,
        {
          method: "POST",
          headers: {
            "admin-token": token,
          },
        }
      );

      const data = await res.json();

      if (data.ok) {
        fetchUsers();
      } else {
        alert(data.error || "操作失败");
      }
    } catch {
      alert("网络错误");
    }

    setActionMenuId(null);
  };

  const handleViewVotes = async (user: User) => {
    setSelectedUser(user);
    setShowVotes(true);
    setVotesLoading(true);
    setActionMenuId(null);

    const token = getToken();
    if (!token) {
      setVotesLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/proxy/api/arena/admin/users/${user.id}/votes?page=1&page_size=50`,
        {
          headers: {
            "admin-token": token,
          },
        }
      );

      const data = await res.json();

      if (data.ok) {
        setVotes(data.data.votes || []);
      }
    } catch {
      // Ignore
    } finally {
      setVotesLoading(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">用户管理</h1>
          <p className="mt-1 text-sm text-text-muted">
            查看和管理注册用户
          </p>
        </div>
        <Button variant="ghost" onClick={fetchUsers} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索邮箱..."
            className="pl-10"
          />
        </div>
        <Button type="submit">搜索</Button>
      </form>

      {/* Content */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-text-muted">加载中...</div>
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-negative">{error}</div>
        </div>
      ) : users.length === 0 ? (
        <Card className="flex h-64 flex-col items-center justify-center">
          <Users className="h-12 w-12 text-text-muted" />
          <p className="mt-4 text-text-muted">
            {search ? "未找到匹配的用户" : "暂无用户"}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <Card
              key={user.id}
              className={cn(
                "flex items-center gap-4 p-4",
                user.is_disabled && "opacity-60"
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full",
                  user.is_disabled
                    ? "bg-surface-elevated"
                    : "bg-interactive-accent/10"
                )}
              >
                <Users
                  className={cn(
                    "h-5 w-5",
                    user.is_disabled
                      ? "text-text-muted"
                      : "text-interactive-accent"
                  )}
                />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-text-primary truncate">
                    {user.email}
                  </h3>
                  {user.is_disabled && (
                    <span className="rounded bg-negative/10 px-2 py-0.5 text-xs text-negative">
                      已禁用
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-text-muted">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    注册: {formatDate(user.created_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Vote className="h-3.5 w-3.5" />
                    投票: {user.vote_count}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="relative">
                <button
                  onClick={() =>
                    setActionMenuId(actionMenuId === user.id ? null : user.id)
                  }
                  className="rounded p-2 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>

                {actionMenuId === user.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setActionMenuId(null)}
                    />
                    <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border-faint bg-surface-secondary p-1 shadow-lg">
                      <button
                        onClick={() => handleViewVotes(user)}
                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                      >
                        <History className="h-4 w-4" />
                        投票历史
                      </button>
                      <button
                        onClick={() => handleToggleDisabled(user)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-3 py-2 text-sm",
                          user.is_disabled
                            ? "text-positive hover:bg-positive/10"
                            : "text-negative hover:bg-negative/10"
                        )}
                      >
                        {user.is_disabled ? (
                          <>
                            <UserCheck className="h-4 w-4" />
                            启用
                          </>
                        ) : (
                          <>
                            <UserX className="h-4 w-4" />
                            禁用
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Vote History Modal */}
      {showVotes && selectedUser && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setShowVotes(false)}
          />
          <div className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-2xl -translate-y-1/2 rounded-xl border border-border-faint bg-surface-secondary p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                投票历史 - {selectedUser.email}
              </h2>
              <button
                onClick={() => setShowVotes(false)}
                className="rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
              >
                ✕
              </button>
            </div>

            {votesLoading ? (
              <div className="flex h-40 items-center justify-center">
                <div className="text-text-muted">加载中...</div>
              </div>
            ) : votes.length === 0 ? (
              <div className="flex h-40 items-center justify-center">
                <div className="text-text-muted">暂无投票记录</div>
              </div>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {votes.map((vote) => (
                  <div
                    key={vote.id}
                    className="rounded-lg bg-surface-tertiary p-3"
                  >
                    <p className="line-clamp-2 text-sm text-text-primary">
                      {vote.prompt}
                    </p>
                    <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
                      <span>{formatDate(vote.created_at)}</span>
                      <span>{voteLabel(vote.user_vote)}</span>
                      <span>{vote.turn_count} 轮</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
