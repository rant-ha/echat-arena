"use client";

import useSWR from "swr";
import { Plus, Search, MessageSquare } from "lucide-react";
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
    .limit(20);

  if (error) throw error;
  return (data as RecentVoteRow[]) || [];
}

export function Sidebar(props: {
  className?: string;
  onNavigate?: () => void;
  userEmail?: string | null;
}) {
  const { className, onNavigate, userEmail } = props;

  const { data, error, isLoading } = useSWR<RecentVoteRow[]>(
    "sidebar:recent-votes",
    fetchRecentVotes,
    {
      revalidateOnFocus: false,
    }
  );

  const rows = data || [];

  // Get user initials for avatar
  const userInitials = userEmail
    ? userEmail.slice(0, 2).toUpperCase()
    : "U";

  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col",
        "bg-[var(--sidebar-bg)]",
        className
      )}
    >
      {/* Logo area */}
      <div className="flex items-center gap-3 px-3 py-3">
        <a
          href="/"
          className="flex items-center gap-2 text-[var(--text-primary)] hover:opacity-80 transition-opacity"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
            <MessageSquare className="h-4 w-4" />
          </div>
        </a>
        
        {/* New Chat button */}
        <a
          href="/battle"
          onClick={onNavigate}
          className={cn(
            "ml-auto flex h-8 w-8 items-center justify-center rounded-lg",
            "hover:bg-white/10 transition-colors",
            "text-[var(--text-primary)]"
          )}
          title="新对战"
        >
          <Plus className="h-5 w-5" />
        </a>
      </div>

      {/* New Chat main button */}
      <div className="px-2 py-2">
        <a
          href="/battle"
          onClick={onNavigate}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5",
            "text-sm text-[var(--text-primary)]",
            "hover:bg-white/10 transition-colors"
          )}
        >
          <Plus className="h-4 w-4" />
          New chat
        </a>
        
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5",
            "text-sm text-[var(--text-primary)]",
            "hover:bg-white/10 transition-colors"
          )}
        >
          <Search className="h-4 w-4" />
          Search chats
        </button>
      </div>

      {/* Your chats section */}
      <div className="px-3 pt-4 pb-2">
        <div className="text-xs font-medium text-[var(--text-muted)]">
          Your chats
        </div>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto px-2">
        {isLoading ? (
          <div className="px-3 py-2 text-xs text-[var(--text-muted)]">加载中…</div>
        ) : error ? (
          <div className="px-3 py-2 text-xs text-red-400">{String(error)}</div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
            暂无历史记录
          </div>
        ) : (
          <ul className="space-y-0.5">
            {rows.map((r) => (
              <li key={r.id}>
                <a
                  href="/history"
                  onClick={onNavigate}
                  className={cn(
                    "block rounded-lg px-3 py-2",
                    "text-sm text-[var(--text-primary)]",
                    "hover:bg-white/10 transition-colors",
                    "truncate"
                  )}
                >
                  {truncate(r.prompt, 35)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Bottom User Profile */}
      <div className="border-t border-[var(--border-color)] p-2">
        <a
          href="/history"
          onClick={onNavigate}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5",
            "hover:bg-white/10 transition-colors"
          )}
        >
          {/* Avatar */}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-xs font-semibold text-white">
            {userInitials}
          </div>
          {/* Email / Account info */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-[var(--text-primary)]">
              {userEmail || "Guest"}
            </div>
            <div className="truncate text-xs text-[var(--text-muted)]">
              Personal account
            </div>
          </div>
        </a>
      </div>
    </aside>
  );
}
