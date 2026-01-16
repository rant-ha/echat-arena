"use client";

import useSWR from "swr";
import { History, Plus } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { cn } from "@/components/ui";

type RecentVoteRow = {
  id: string;
  created_at: string;
  prompt: string;
};

function truncate(text: string, maxLen: number) {
  const t = (text || "").trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1) + "…";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

async function fetchRecentVotes(): Promise<RecentVoteRow[]> {
  const supabase = createSupabaseBrowserClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr) throw authErr;
  if (!user) throw new Error("未登录");

  const { data, error } = await supabase
    .from("votes")
    .select("id, created_at, prompt")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  return (data as RecentVoteRow[]) || [];
}

export function Sidebar(props: {
  className?: string;
  onNavigate?: () => void;
}) {
  const { className, onNavigate } = props;

  const { data, error, isLoading } = useSWR<RecentVoteRow[]>(
    "sidebar:recent-votes",
    fetchRecentVotes,
    {
      revalidateOnFocus: false,
    }
  );

  const rows = data || [];

  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col",
        "bg-card/30",
        "border-r border-border/50",
        className
      )}
    >
      {/* Brand + Top CTA */}
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <a
          href="/"
          className={cn(
            "min-w-0 truncate text-sm font-semibold text-foreground",
            "hover:opacity-90"
          )}
        >
          Model Arena
        </a>

        <a
          href="/battle"
          onClick={onNavigate}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-3 py-1.5",
            "text-xs font-medium text-primary",
            "border border-primary/40 bg-primary/10",
            "hover:bg-primary/20 hover:border-primary/60",
            "transition-colors"
          )}
        >
          <Plus className="h-4 w-4" />
          新对战
        </a>
      </div>

      {/* History header */}
      <div className="px-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
            <History className="h-4 w-4" />
            历史对话
          </div>
          <a
            href="/history"
            onClick={onNavigate}
            className={cn(
              "text-xs text-muted transition-colors",
              "hover:text-foreground"
            )}
          >
            查看全部
          </a>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <div className="px-2 py-2 text-xs text-muted">加载中…</div>
        ) : error ? (
          <div className="px-2 py-2 text-xs text-red-300">{String(error)}</div>
        ) : rows.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted">
            暂无历史。去 <a className="text-primary hover:underline" href="/battle">/battle</a>{" "}
            完成一次投票后再来。
          </div>
        ) : (
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.id}>
                <a
                  href="/history"
                  onClick={onNavigate}
                  className={cn(
                    "block rounded-lg px-3 py-2",
                    "hover:bg-white/5",
                    "transition-colors"
                  )}
                >
                  <div className="text-[11px] text-muted">{formatTime(r.created_at)}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-foreground/90">
                    {truncate(r.prompt, 120)}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="border-t border-border/50 p-4">
        <a
          href="/battle"
          onClick={onNavigate}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2",
            "text-sm font-medium",
            "border border-primary/40 bg-primary/10 text-primary",
            "hover:bg-primary/20 hover:border-primary/60",
            "transition-colors"
          )}
        >
          <Plus className="h-4 w-4" />
          新对战
        </a>

        <a
          href="/history"
          onClick={onNavigate}
          className={cn(
            "mt-2 flex w-full items-center justify-center rounded-lg px-3 py-2",
            "text-sm text-muted",
            "border border-border/60 bg-background/10",
            "hover:bg-white/5 hover:text-foreground",
            "transition-colors"
          )}
        >
          历史记录
        </a>
      </div>
    </aside>
  );
}
