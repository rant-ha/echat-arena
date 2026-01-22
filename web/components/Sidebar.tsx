"use client";

import useSWR from "swr";
import { 
  Plus, 
  MessageSquare, 
  Trophy,
  PanelLeftClose,
  PanelLeftOpen, 
  ChevronRight
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { cn } from "@/components/ui";
import { useState, useCallback, useEffect } from "react";

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

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
  userEmail?: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar(props: SidebarProps) {
  const { className, onNavigate, userEmail, collapsed = false, onToggleCollapse } = props;

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
        "flex h-full flex-col transition-[width] duration-300 ease-in-out border-r border-border-faint bg-surface-secondary",
        collapsed ? "w-[60px]" : "w-[260px]",
        className
      )}
    >
      {/* Header / Toggle Area */}
      <div className={cn("flex items-center p-3 h-14", collapsed ? "justify-center" : "justify-between")}>
        {/* Toggle Button */}
        <button
          onClick={onToggleCollapse}
          className="group flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      {/* Main Navigation */}
      <div className="flex flex-col gap-1 p-2">
        <a
          href="/battle"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-elevated group",
            collapsed ? "justify-center" : ""
          )}
          title="New Chat"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center text-text-primary">
             <Plus className="h-5 w-5" />
          </div>
          {!collapsed && (
            <span className="text-sm font-medium text-text-primary">New Chat</span>
          )}
        </a>

        <a
          href="/leaderboard"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-elevated group",
            collapsed ? "justify-center" : ""
          )}
          title="Leaderboard"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center text-text-primary">
            <Trophy className="h-5 w-5" />
          </div>
          {!collapsed && (
            <>
              <span className="text-sm font-medium text-text-primary flex-1">Leaderboard</span>
              <ChevronRight className="h-4 w-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </>
          )}
        </a>
      </div>

      {/* Recent Chats Section */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!collapsed && (
          <div className="mb-2 px-2 text-xs font-medium text-text-muted/60 uppercase tracking-wider">
            Recents
          </div>
        )}
        
        {isLoading ? (
          !collapsed && <div className="px-2 text-xs text-text-muted">Loading...</div>
        ) : error ? (
          !collapsed && <div className="px-2 text-xs text-negative">Error loading history</div>
        ) : rows.length === 0 ? (
          !collapsed && <div className="px-2 text-xs text-text-muted">No history yet</div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {rows.map((r) => (
              <li key={r.id}>
                <a
                  href={`/chat/${r.id}`}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-surface-elevated",
                    collapsed ? "justify-center" : ""
                  )}
                  title={r.prompt}
                >
                  {collapsed ? (
                     <div className="flex h-6 w-6 shrink-0 items-center justify-center text-text-secondary">
                       <MessageSquare className="h-4 w-4" />
                     </div>
                  ) : (
                    <span className="truncate text-text-secondary hover:text-text-primary transition-colors">
                      {truncate(r.prompt, 28)}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* User Profile Footer */}
      <div className="border-t border-border-faint p-2">
        <a
          href="/history"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-elevated",
            collapsed ? "justify-center" : ""
          )}
          title={userEmail || "Guest"}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-medium text-text-primary ring-1 ring-border-faint">
            {userInitials}
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-text-primary">
                {userEmail ? userEmail.split('@')[0] : "Guest"}
              </span>
              <span className="truncate text-xs text-text-muted">
                {userEmail || "Login to save history"}
              </span>
            </div>
          )}
        </a>
      </div>
    </aside>
  );
}
