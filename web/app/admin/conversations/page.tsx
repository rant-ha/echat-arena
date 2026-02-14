"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  MessagesSquare,
  Search,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Filter,
  X,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, Input } from "@/components/ui";
import { cn } from "@/components/ui";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { useI18n } from "@/utils/i18n-context";

/* ---------- types ---------- */

interface ModelConfig {
  left: { arm: string; model_id: string };
  right: { arm: string; model_id: string };
}

interface Conversation {
  id: string;
  created_at: string;
  prompt: string;
  reply_a: string;
  reply_b: string;
  user_vote: string | null;
  user_email: string;
  user_id: string;
  turn_count: number;
  base_model_name: string;
  model_config: ModelConfig | null;
  conversation_history: unknown[];
  winner_type: string | null;
}

/* ---------- helpers ---------- */

function formatDate(iso: string | null, locale: string = "zh") {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale === "en" ? "en-US" : "zh-CN");
}

function voteLabel(v: string | null, t: (key: string) => string): string {
  if (!v) return t("vote.no_vote");
  if (v === "model_a") return t("vote.model_a");
  if (v === "model_b") return t("vote.model_b");
  if (v === "tie") return t("vote.tie");
  if (v === "both_bad") return t("vote.both_bad");
  return v;
}

function voteBadgeClass(v: string | null): string {
  if (v === "model_a") return "bg-blue-500/10 text-blue-400";
  if (v === "model_b") return "bg-green-500/10 text-green-400";
  if (v === "tie") return "bg-yellow-500/10 text-yellow-400";
  if (v === "both_bad") return "bg-red-500/10 text-red-400";
  return "bg-surface-elevated text-text-muted";
}

function winnerBadgeClass(w: string | null): string {
  if (w === "strategy") return "bg-green-500/10 text-green-400";
  if (w === "baseline") return "bg-blue-500/10 text-blue-400";
  return "bg-surface-elevated text-text-muted";
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}

/* ---------- component ---------- */

export default function ConversationsPage() {
  const { getToken } = useAdminAuth();
  const { t, locale } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;

  function winnerLabel(w: string | null): string {
    if (w === "strategy") return tRef.current("admin.conversations.strategy_label");
    if (w === "baseline") return tRef.current("admin.conversations.baseline_label");
    return "-";
  }

  function armLabel(arm: string): string {
    if (arm === "baseline") return tRef.current("admin.conversations.baseline_label");
    if (arm === "strategy") return tRef.current("admin.conversations.strategy_label");
    return arm;
  }

  // data
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // pagination
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // search & filters
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [voteFilter, setVoteFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // export
  const [exporting, setExporting] = useState(false);

  // expand
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /* ---------- fetch ---------- */

  const fetchConversations = useCallback(async () => {
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
        page: String(page),
        page_size: String(pageSize),
      });
      if (search) params.set("search", search);
      if (voteFilter) params.set("vote_type", voteFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (modelFilter) params.set("model", modelFilter);

      const res = await fetch(
        `/api/proxy/api/arena/admin/conversations?${params}`,
        { headers: { "admin-token": token } }
      );

      const data = await res.json();

      if (data.ok) {
        setConversations(data.data.conversations || []);
        setTotal(data.data.total ?? 0);
      } else {
        setError(data.error || tRef.current("admin.conversations.fetch_error"));
      }
    } catch {
      setError(tRef.current("common.error"));
    } finally {
      setLoading(false);
    }
  }, [getToken, page, search, voteFilter, dateFrom, dateTo, modelFilter]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  /* ---------- handlers ---------- */

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setSearch("");
    setVoteFilter("");
    setDateFrom("");
    setDateTo("");
    setModelFilter("");
    setPage(1);
  };

  const hasFilters = search || voteFilter || dateFrom || dateTo || modelFilter;

  /* ---------- CSV export ---------- */

  const escapeCSV = (s: string) => {
    let v = s.replace(/"/g, '""');
    // Prevent DDE/formula injection
    if (/^[=+\-@\t\r|]/.test(v)) {
      v = "'" + v;
    }
    if (/[,"\n\r]/.test(v)) {
      v = `"${v}"`;
    }
    return v;
  };

  const handleExportCSV = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setExporting(true);
    try {
      // Build query params matching current filters
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (voteFilter) params.set("vote_type", voteFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (modelFilter) params.set("model", modelFilter);

      const res = await fetch(
        `/api/proxy/api/arena/admin/conversations/export?${params.toString()}`,
        { headers: { "admin-token": token } }
      );
      const data = await res.json();

      if (!data.ok || !data.data?.conversations) {
        setError(tRef.current("common.operation_failed"));
        return;
      }

      const allConversations = data.data.conversations as Conversation[];

      if (allConversations.length === 0) return;

      const csvHeaders = [
        tRef.current("admin.conversations.csv_time"),
        tRef.current("admin.conversations.csv_email"),
        tRef.current("admin.conversations.csv_prompt"),
        tRef.current("admin.conversations.csv_vote"),
        tRef.current("admin.conversations.csv_model"),
        tRef.current("admin.conversations.csv_turns"),
        tRef.current("admin.conversations.csv_winner"),
      ];

      const rows = allConversations.map((c) =>
        [
          formatDate(c.created_at, locale),
          c.user_email,
          (c.prompt || "").replace(/\n/g, " "),
          voteLabel(c.user_vote, tRef.current),
          c.base_model_name || "-",
          String(c.turn_count),
          winnerLabel(c.winner_type),
        ]
          .map(escapeCSV)
          .join(",")
      );

      const csv = "\uFEFF" + csvHeaders.join(",") + "\n" + rows.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `conversations_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(tRef.current("common.operation_failed"));
    } finally {
      setExporting(false);
    }
  }, [getToken, search, voteFilter, dateFrom, dateTo, modelFilter, locale]);

  /* ---------- render ---------- */

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {t("admin.conversations.title")}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {t("admin.conversations.subtitle")}
            {!loading && (
              <span className="ml-2 text-text-secondary">
                ({t("admin.conversations.total_count", { count: total })})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={handleExportCSV} disabled={exporting}>
            {exporting ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {exporting ? tRef.current("admin.conversations.exporting") : t("common.export_csv")}
          </Button>
          <Button variant="ghost" onClick={fetchConversations} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Search + Filter Toggle */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <div className="relative min-w-0 flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("admin.conversations.search_placeholder")}
              className="pl-10"
            />
          </div>
          <Button type="submit">{t("common.search")}</Button>
        </form>

        <Button
          variant="ghost"
          onClick={() => setShowFilters(!showFilters)}
          className={cn(hasFilters && "text-interactive-accent")}
        >
          <Filter className="mr-1.5 h-4 w-4" />
          {t("admin.conversations.filter")}
          {hasFilters && (
            <span className="ml-1.5 rounded-full bg-interactive-accent/20 px-1.5 py-0.5 text-xs">
              !
            </span>
          )}
        </Button>

        {hasFilters && (
          <Button variant="ghost" onClick={handleClearFilters}>
            <X className="mr-1 h-3.5 w-3.5" />
            {t("common.clear")}
          </Button>
        )}
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Vote type */}
            <div className="min-w-[140px]">
              <label className="mb-1 block text-xs text-text-muted">
                {t("admin.conversations.vote_type")}
              </label>
              <select
                value={voteFilter}
                onChange={(e) => {
                  setVoteFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-border-faint bg-transparent px-3 py-2 text-sm outline-none focus:border-interactive-accent/70"
              >
                <option value="" className="bg-surface-secondary text-text-primary">{t("common.all")}</option>
                <option value="model_a" className="bg-surface-secondary text-text-primary">{t("vote.model_a")}</option>
                <option value="model_b" className="bg-surface-secondary text-text-primary">{t("vote.model_b")}</option>
                <option value="tie" className="bg-surface-secondary text-text-primary">{t("vote.tie")}</option>
                <option value="both_bad" className="bg-surface-secondary text-text-primary">{t("vote.both_bad")}</option>
              </select>
            </div>

            {/* Date from */}
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs text-text-muted">
                {t("admin.conversations.date_from")}
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted pointer-events-none" />
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Date to */}
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs text-text-muted">
                {t("admin.conversations.date_to")}
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted pointer-events-none" />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Model filter */}
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs text-text-muted">
                {t("admin.conversations.model")}
              </label>
              <Input
                value={modelFilter}
                onChange={(e) => {
                  setModelFilter(e.target.value);
                  setPage(1);
                }}
                placeholder={t("admin.conversations.model_placeholder")}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-text-muted">{t("common.loading")}</div>
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-negative">{error}</div>
        </div>
      ) : conversations.length === 0 ? (
        <Card className="flex h-64 flex-col items-center justify-center">
          <MessagesSquare className="h-12 w-12 text-text-muted" />
          <p className="mt-4 text-text-muted">
            {hasFilters ? t("admin.conversations.no_match") : t("admin.conversations.no_conversations")}
          </p>
        </Card>
      ) : (
        <>
          {/* Conversation List */}
          <div className="space-y-2">
            {conversations.map((conv) => {
              const isExpanded = expandedId === conv.id;

              return (
                <div key={conv.id}>
                  {/* Row */}
                  <Card
                    className={cn(
                      "cursor-pointer p-4 transition-colors hover:border-border-strong",
                      isExpanded && "border-interactive-accent/30"
                    )}
                    onClick={() =>
                      setExpandedId(isExpanded ? null : conv.id)
                    }
                  >
                    <div className="flex items-center gap-3">
                      {/* Expand icon */}
                      <div className="flex-shrink-0 text-text-muted">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </div>

                      {/* Main info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-text-secondary truncate max-w-[180px]">
                            {conv.user_email}
                          </span>
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-xs font-medium",
                              voteBadgeClass(conv.user_vote)
                            )}
                          >
                            {voteLabel(conv.user_vote, t)}
                          </span>
                          {conv.base_model_name && (
                            <span className="rounded bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
                              {conv.base_model_name}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-text-primary line-clamp-1">
                          {conv.prompt}
                        </p>
                      </div>

                      {/* Meta */}
                      <div className="flex flex-shrink-0 items-center gap-4 text-xs text-text-muted">
                        <span>{conv.turn_count} {t("admin.users.turns")}</span>
                        <span className="hidden sm:inline">
                          {formatDate(conv.created_at, locale)}
                        </span>
                      </div>
                    </div>
                  </Card>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="mt-1 rounded-xl border border-border-faint bg-surface-secondary/50 p-4">
                      {/* Metadata bar */}
                      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                        <span>
                          {t("admin.conversations.time")}: {formatDate(conv.created_at, locale)}
                        </span>
                        <span>{t("admin.conversations.email")}: {conv.user_email}</span>
                        <span>{t("admin.conversations.turn_count")}: {conv.turn_count}</span>
                        {conv.winner_type && (
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 font-medium",
                              winnerBadgeClass(conv.winner_type)
                            )}
                          >
                            {t("admin.conversations.winner")}: {winnerLabel(conv.winner_type)}
                          </span>
                        )}
                      </div>

                      {/* Prompt */}
                      <div className="mb-4">
                        <h4 className="mb-1 text-xs font-medium text-text-muted uppercase tracking-wide">
                          {t("admin.conversations.prompt")}
                        </h4>
                        <div className="rounded-lg bg-surface-elevated p-3 text-sm text-text-primary whitespace-pre-wrap">
                          {conv.prompt}
                        </div>
                      </div>

                      {/* Side-by-side responses */}
                      <div className="grid gap-4 md:grid-cols-2">
                        {/* Model A */}
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide">
                              {t("admin.conversations.model_a")}
                            </h4>
                            {conv.model_config?.left && (
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-xs",
                                  conv.model_config.left.arm === "strategy"
                                    ? "bg-green-500/10 text-green-400"
                                    : "bg-blue-500/10 text-blue-400"
                                )}
                              >
                                {armLabel(conv.model_config.left.arm)}
                              </span>
                            )}
                            {conv.user_vote === "model_a" && (
                              <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-400">
                                {t("vote.selected")}
                              </span>
                            )}
                          </div>
                          <div className="max-h-[500px] overflow-y-auto rounded-lg bg-surface-elevated p-3 text-sm prose-invert">
                            <MarkdownRenderer>
                              {conv.reply_a || t("admin.conversations.empty")}
                            </MarkdownRenderer>
                          </div>
                        </div>

                        {/* Model B */}
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide">
                              {t("admin.conversations.model_b")}
                            </h4>
                            {conv.model_config?.right && (
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-xs",
                                  conv.model_config.right.arm === "strategy"
                                    ? "bg-green-500/10 text-green-400"
                                    : "bg-blue-500/10 text-blue-400"
                                )}
                              >
                                {armLabel(conv.model_config.right.arm)}
                              </span>
                            )}
                            {conv.user_vote === "model_b" && (
                              <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-400">
                                {t("vote.selected")}
                              </span>
                            )}
                          </div>
                          <div className="max-h-[500px] overflow-y-auto rounded-lg bg-surface-elevated p-3 text-sm prose-invert">
                            <MarkdownRenderer>
                              {conv.reply_b || t("admin.conversations.empty")}
                            </MarkdownRenderer>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-text-muted">
              {t("admin.conversations.page_info", { page, total: totalPages, count: total })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t("common.prev_page")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t("common.next_page")}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
