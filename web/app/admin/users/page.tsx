"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  Eye,
  X,
  Mail,
  Clock,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, Input } from "@/components/ui";
import { cn } from "@/components/ui";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { useI18n } from "@/utils/i18n-context";

// ---------- Types ----------

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  vote_count: number;
  is_disabled: boolean;
}

interface VoteRecord {
  id: string;
  created_at: string;
  prompt: string;
  user_vote: string;
  turn_count: number;
}

interface UserProfile {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_disabled: boolean;
}

interface UserStats {
  total_votes: number;
  strategy_wins: number;
  baseline_wins: number;
  strategy_preference_pct: number;
  most_used_model: string;
  avg_turns_per_session: number;
  first_activity: string | null;
  last_activity: string | null;
}

interface ConversationDetail {
  id: string;
  created_at: string;
  prompt: string;
  reply_a: string;
  reply_b: string;
  user_vote: string;
  turn_count: number;
  base_model_name: string;
  conversation_history: unknown[];
  model_config: Record<string, unknown>;
}

interface ActivityDay {
  date: string;
  count: number;
}

interface UserDetail {
  profile: UserProfile;
  stats: UserStats;
  recent_conversations: ConversationDetail[];
  activity_timeline: ActivityDay[];
}

// ---------- Helpers ----------

function formatDate(iso: string | null, locale: string = "zh") {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale === "en" ? "en-US" : "zh-CN");
}

function formatShortDate(iso: string | null, locale: string = "zh") {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "en" ? "en-US" : "zh-CN", { month: "short", day: "numeric" });
}

function voteBadgeColor(v: string | null): string {
  if (v === "model_a") return "bg-blue-500/15 text-blue-400";
  if (v === "model_b") return "bg-emerald-500/15 text-emerald-400";
  if (v === "tie") return "bg-amber-500/15 text-amber-400";
  if (v === "both_bad") return "bg-red-500/15 text-red-400";
  return "bg-surface-elevated text-text-muted";
}

// ---------- Sub-components ----------

function StatCard({
  value,
  label,
  className,
}: {
  value: string | number;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-border-faint bg-surface-tertiary p-3",
        className
      )}
    >
      <span className="text-lg font-semibold text-text-primary">{value}</span>
      <span className="mt-0.5 text-xs text-text-muted">{label}</span>
    </div>
  );
}

function ActivityChart({ timeline, emptyLabel }: { timeline: ActivityDay[]; emptyLabel: string }) {
  if (!timeline || timeline.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center text-sm text-text-muted">
        {emptyLabel}
      </div>
    );
  }

  const maxCount = Math.max(...timeline.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-[3px]" style={{ height: 64 }}>
      {timeline.map((day) => {
        const heightPct = (day.count / maxCount) * 100;
        return (
          <div
            key={day.date}
            className="group relative flex-1 min-w-[4px]"
            style={{ height: "100%" }}
          >
            <div
              className="absolute bottom-0 w-full rounded-t bg-interactive-accent/60 transition-colors group-hover:bg-interactive-accent"
              style={{ height: `${Math.max(heightPct, 4)}%` }}
            />
            <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-surface-primary px-2 py-1 text-xs text-text-primary shadow-lg group-hover:block">
              {day.date}: {day.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConversationCard({ conv, t, voteLabel, locale }: { conv: ConversationDetail; t: (key: string, params?: Record<string, string | number>) => string; voteLabel: (v: string | null) => string; locale: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border-faint bg-surface-tertiary">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 text-left"
      >
        <p className="line-clamp-2 text-sm text-text-primary">{conv.prompt}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span>{formatShortDate(conv.created_at, locale)}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              voteBadgeColor(conv.user_vote)
            )}
          >
            {voteLabel(conv.user_vote)}
          </span>
          <span>{conv.turn_count} {t("admin.users.turns")}</span>
          <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px]">
            {conv.base_model_name}
          </span>
          <span className="ml-auto text-text-muted">
            {expanded ? t("common.collapse") : t("common.expand")}
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border-faint p-3 space-y-3">
          <div className="grid grid-cols-1 gap-3">
            {(() => {
              const mc = conv.model_config as { left?: { arm?: string }; right?: { arm?: string } } | undefined;
              const leftArm = mc?.left?.arm;
              const rightArm = mc?.right?.arm;
              const leftLabel = leftArm ? (leftArm === "baseline" ? t("admin.dashboard.baseline") : t("admin.dashboard.strategy")) : "";
              const rightLabel = rightArm ? (rightArm === "baseline" ? t("admin.dashboard.baseline") : t("admin.dashboard.strategy")) : "";
              return (
                <>
                  {/* Model A */}
                  <div className="rounded-lg border border-border-faint bg-surface-secondary/50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          conv.user_vote === "model_a"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-surface-elevated text-text-muted"
                        )}
                      >
                        Model A
                      </span>
                      {leftLabel && <span className="text-xs text-text-muted">({leftLabel})</span>}
                      {conv.user_vote === "model_a" && (
                        <span className="text-xs text-blue-400">-- {t("vote.user_selected")}</span>
                      )}
                    </div>
                    <div className="prose prose-sm prose-invert max-w-none text-sm text-text-secondary">
                      <MarkdownRenderer>{conv.reply_a || ""}</MarkdownRenderer>
                    </div>
                  </div>

                  {/* Model B */}
                  <div className="rounded-lg border border-border-faint bg-surface-secondary/50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          conv.user_vote === "model_b"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-surface-elevated text-text-muted"
                        )}
                      >
                        Model B
                      </span>
                      {rightLabel && <span className="text-xs text-text-muted">({rightLabel})</span>}
                      {conv.user_vote === "model_b" && (
                        <span className="text-xs text-emerald-400">-- {t("vote.user_selected")}</span>
                      )}
                    </div>
                    <div className="prose prose-sm prose-invert max-w-none text-sm text-text-secondary">
                      <MarkdownRenderer>{conv.reply_b || ""}</MarkdownRenderer>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Main Page ----------

export default function UsersPage() {
  const { getToken } = useAdminAuth();
  const { t, locale } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  // Vote history modal
  const [showVotes, setShowVotes] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [votes, setVotes] = useState<VoteRecord[]>([]);
  const [votesLoading, setVotesLoading] = useState(false);

  // Detail drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerUser, setDrawerUser] = useState<User | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // i18n-aware vote label (uses tRef to avoid re-renders on locale change)
  const voteLabel = useCallback((v: string | null): string => {
    if (!v) return tRef.current("vote.no_vote");
    if (v === "model_a") return tRef.current("vote.model_a");
    if (v === "model_b") return tRef.current("vote.model_b");
    if (v === "tie") return tRef.current("vote.tie");
    if (v === "both_bad") return tRef.current("vote.both_bad");
    return v;
  }, []);

  // ---------- Fetchers ----------

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const token = getToken();
    if (!token) {
      setError(tRef.current("common.not_logged_in"));
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
        setError(data.error || tRef.current("admin.users.fetch_error"));
      }
    } catch {
      setError(tRef.current("common.error"));
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
        alert(data.error || t("common.operation_failed"));
      }
    } catch {
      alert(t("common.error"));
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

  const handleViewDetail = async (user: User) => {
    setDrawerUser(user);
    setDrawerOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setUserDetail(null);
    setActionMenuId(null);

    const token = getToken();
    if (!token) {
      setDetailError(t("common.not_logged_in"));
      setDetailLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/proxy/api/arena/admin/users/${user.id}/detail`,
        {
          headers: {
            "admin-token": token,
          },
        }
      );

      const data = await res.json();

      if (data.ok) {
        setUserDetail(data.data);
      } else {
        setDetailError(data.error || t("admin.users.detail_fetch_error"));
      }
    } catch {
      setDetailError(t("common.error"));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => {
      setDrawerUser(null);
      setUserDetail(null);
      setDetailError(null);
    }, 300);
  };

  // Close drawer on Escape key
  useEffect(() => {
    if (!drawerOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDrawer();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [drawerOpen]);

  // ---------- Render ----------

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{t("admin.users.title")}</h1>
          <p className="mt-1 text-sm text-text-muted">{t("admin.users.subtitle")}</p>
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
            placeholder={t("admin.users.search_email")}
            className="pl-10"
          />
        </div>
        <Button type="submit">{t("common.search")}</Button>
      </form>

      {/* Content */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-text-muted">{t("common.loading")}</div>
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-negative">{error}</div>
        </div>
      ) : users.length === 0 ? (
        <Card className="flex h-64 flex-col items-center justify-center">
          <Users className="h-12 w-12 text-text-muted" />
          <p className="mt-4 text-text-muted">
            {search ? t("admin.users.no_match") : t("admin.users.no_users")}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <Card
              key={user.id}
              className={cn(
                "flex items-center gap-4 p-4 relative",
                user.is_disabled && "opacity-60",
                actionMenuId === user.id && "z-30"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full",
                  user.is_disabled ? "bg-surface-elevated" : "bg-interactive-accent/10"
                )}
              >
                <Users
                  className={cn("h-5 w-5", user.is_disabled ? "text-text-muted" : "text-interactive-accent")}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-text-primary truncate">{user.email}</h3>
                  {user.is_disabled && (
                    <span className="rounded bg-negative/10 px-2 py-0.5 text-xs text-negative">
                      {t("admin.users.disabled")}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-text-muted">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {t("admin.users.registered")}: {formatDate(user.created_at, locale)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Vote className="h-3.5 w-3.5" />
                    {t("admin.users.votes")}: {user.vote_count}
                  </span>
                </div>
              </div>

              <div className="relative">
                <button
                  onClick={() => setActionMenuId(actionMenuId === user.id ? null : user.id)}
                  className="rounded p-2 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>

                {actionMenuId === user.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setActionMenuId(null)} />
                    <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border-faint bg-surface-secondary p-1 shadow-lg">
                      <button
                        onClick={() => handleViewDetail(user)}
                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                      >
                        <Eye className="h-4 w-4" />
                        {t("admin.users.view_detail")}
                      </button>
                      <button
                        onClick={() => handleViewVotes(user)}
                        className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                      >
                        <History className="h-4 w-4" />
                        {t("admin.users.vote_history")}
                      </button>
                      <button
                        onClick={() => handleToggleDisabled(user)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-3 py-2 text-sm",
                          user.is_disabled ? "text-positive hover:bg-positive/10" : "text-negative hover:bg-negative/10"
                        )}
                      >
                        {user.is_disabled ? (
                          <>
                            <UserCheck className="h-4 w-4" />
                            {t("admin.users.enable")}
                          </>
                        ) : (
                          <>
                            <UserX className="h-4 w-4" />
                            {t("admin.users.disable")}
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
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowVotes(false)} />
          <div className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-2xl -translate-y-1/2 rounded-xl border border-border-faint bg-surface-secondary p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                {t("admin.users.vote_history")} - {selectedUser.email}
              </h2>
              <button
                onClick={() => setShowVotes(false)}
                className="rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {votesLoading ? (
              <div className="flex h-40 items-center justify-center">
                <div className="text-text-muted">{t("common.loading")}</div>
              </div>
            ) : votes.length === 0 ? (
              <div className="flex h-40 items-center justify-center">
                <div className="text-text-muted">{t("admin.users.no_votes")}</div>
              </div>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {votes.map((vote) => (
                  <div key={vote.id} className="rounded-lg bg-surface-tertiary p-3">
                    <p className="line-clamp-2 text-sm text-text-primary">{vote.prompt}</p>
                    <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
                      <span>{formatDate(vote.created_at, locale)}</span>
                      <span>{voteLabel(vote.user_vote)}</span>
                      <span>{vote.turn_count} {t("admin.users.turns")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Detail Drawer Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/40 transition-opacity duration-300",
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={closeDrawer}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-[480px] flex-col",
          "border-l border-border-faint bg-surface-secondary shadow-2xl",
          "transition-transform duration-300 ease-in-out",
          drawerOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-border-faint px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-primary truncate">
              {t("admin.users.detail_title")}
            </h2>
            {drawerUser && (
              <p className="mt-0.5 text-sm text-text-muted truncate">{drawerUser.email}</p>
            )}
          </div>
          <button
            onClick={closeDrawer}
            className="ml-3 rounded-lg p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {detailLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="h-6 w-6 animate-spin text-text-muted" />
                <span className="text-sm text-text-muted">{t("common.loading")}</span>
              </div>
            </div>
          ) : detailError ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-sm text-negative">{detailError}</div>
            </div>
          ) : userDetail ? (
            <div className="space-y-0">
              {/* Profile Section */}
              <div className="border-b border-border-faint px-5 py-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-muted uppercase tracking-wider">
                  <Users className="h-3.5 w-3.5" />
                  {t("admin.users.profile")}
                </h3>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-text-muted shrink-0" />
                    <span className="text-text-muted">{t("admin.users.email")}</span>
                    <span className="ml-auto text-text-primary truncate max-w-[240px]">
                      {userDetail.profile.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="h-4 w-4 text-text-muted shrink-0" />
                    <span className="text-text-muted">{t("admin.users.registered_time")}</span>
                    <span className="ml-auto text-text-primary">
                      {formatDate(userDetail.profile.created_at, locale)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="h-4 w-4 text-text-muted shrink-0" />
                    <span className="text-text-muted">{t("admin.users.last_login")}</span>
                    <span className="ml-auto text-text-primary">
                      {formatDate(userDetail.profile.last_sign_in_at, locale)}
                    </span>
                  </div>
                  {userDetail.profile.is_disabled && (
                    <div className="mt-1">
                      <span className="rounded bg-negative/10 px-2 py-0.5 text-xs text-negative">
                        {t("admin.users.disabled")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats Section */}
              <div className="border-b border-border-faint px-5 py-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-muted uppercase tracking-wider">
                  <BarChart3 className="h-3.5 w-3.5" />
                  {t("admin.users.stats_summary")}
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  <StatCard value={userDetail.stats.total_votes} label={t("admin.users.total_votes")} />
                  <StatCard
                    value={`${Math.round(userDetail.stats.strategy_preference_pct)}%`}
                    label={t("admin.users.strategy_preference")}
                  />
                  <StatCard
                    value={userDetail.stats.most_used_model || "-"}
                    label={t("admin.users.most_used_model")}
                    className="text-center"
                  />
                  <StatCard
                    value={userDetail.stats.avg_turns_per_session.toFixed(1)}
                    label={t("admin.users.avg_turns")}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <StatCard value={userDetail.stats.strategy_wins} label={t("admin.users.strategy_wins")} />
                  <StatCard value={userDetail.stats.baseline_wins} label={t("admin.users.baseline_wins")} />
                </div>
              </div>

              {/* Activity Timeline Section */}
              <div className="border-b border-border-faint px-5 py-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-muted uppercase tracking-wider">
                  <BarChart3 className="h-3.5 w-3.5" />
                  {t("admin.users.activity_timeline")}
                </h3>
                <ActivityChart timeline={userDetail.activity_timeline} emptyLabel={t("admin.users.no_activity")} />
                {userDetail.activity_timeline.length > 0 && (
                  <div className="mt-1 flex justify-between text-[10px] text-text-muted">
                    <span>{userDetail.activity_timeline[0]?.date}</span>
                    <span>{userDetail.activity_timeline[userDetail.activity_timeline.length - 1]?.date}</span>
                  </div>
                )}
              </div>

              {/* Recent Conversations Section */}
              <div className="px-5 py-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-muted uppercase tracking-wider">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {t("admin.users.recent_conversations")}
                  <span className="ml-1 rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] font-normal">
                    {userDetail.recent_conversations.length}
                  </span>
                </h3>
                {userDetail.recent_conversations.length === 0 ? (
                  <div className="flex h-20 items-center justify-center text-sm text-text-muted">
                    {t("admin.users.no_conversations")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userDetail.recent_conversations.map((conv) => (
                      <ConversationCard key={conv.id} conv={conv} t={t} voteLabel={voteLabel} locale={locale} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
