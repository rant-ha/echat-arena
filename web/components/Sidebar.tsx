"use client";

import useSWR from "swr";
import Image from "next/image";
import {
  Plus,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Clock,
  LogOut,
  Globe,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { cn } from "@/components/ui";
import { useState, useCallback, useEffect, useRef } from "react";
import { useI18n } from "@/utils/i18n-context";

type RecentVoteRow = {
  id: string;
  created_at: string;
  prompt: string;
};

function truncate(text: string, maxLen: number) {
  const t = (text || "").trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1) + "\u2026";
}

async function fetchRecentVotes(): Promise<RecentVoteRow[]> {
  const supabase = createSupabaseBrowserClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr) throw authErr;
  if (!user) throw new Error("Not logged in");

  const { data, error } = await supabase
    .from("votes")
    .select("id, created_at, prompt")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return (data as RecentVoteRow[]) || [];
}

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
  userEmail?: string | null;
  userName?: string | null;
  userAvatarUrl?: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar(props: SidebarProps) {
  const { className, onNavigate, userEmail, userName, userAvatarUrl, collapsed = false, onToggleCollapse } = props;
  const { locale, setLocale, t } = useI18n();

  const { data, error, isLoading } = useSWR<RecentVoteRow[]>(
    "sidebar:recent-votes",
    fetchRecentVotes,
    {
      revalidateOnFocus: false,
    }
  );

  const rows = data || [];

  // User menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const handleLogout = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  // Get user initials for avatar
  const userInitials = userEmail
    ? userEmail.slice(0, 2).toUpperCase()
    : "U";

  return (
    <aside
      className={cn(
        "flex h-full flex-col transition-[width] duration-300 ease-in-out border-r border-glass-border bg-glass-bg glass-sidebar",
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
          title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
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
          title={t("sidebar.new_chat")}
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center text-text-primary">
             <Plus className="h-5 w-5" />
          </div>
          {!collapsed && (
            <span className="text-sm font-medium text-text-primary">{t("sidebar.new_chat")}</span>
          )}
        </a>

      </div>

      {/* Recent Chats Section */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!collapsed && (
          <div className="mb-2 px-2 text-xs font-medium text-text-muted/60 uppercase tracking-wider">
            {t("sidebar.recents")}
          </div>
        )}

        {isLoading ? (
          !collapsed && <div className="px-2 text-xs text-text-muted">{t("sidebar.loading")}</div>
        ) : error ? (
          !collapsed && <div className="px-2 text-xs text-negative">{t("sidebar.error_loading")}</div>
        ) : rows.length === 0 ? (
          !collapsed && <div className="px-2 text-xs text-text-muted">{t("sidebar.no_history")}</div>
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

      {/* Language Toggle + User Profile Footer */}
      <div className="relative border-t border-border-faint p-2" ref={menuRef}>
        {/* Language Toggle */}
        {!collapsed ? (
          <button
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-surface-elevated hover:text-text-primary mb-1"
            title={locale === "zh" ? "Switch to English" : "\u5207\u6362\u5230\u4e2d\u6587"}
          >
            <Globe className="h-4 w-4" />
            {locale === "zh" ? "EN" : "\u4e2d\u6587"}
          </button>
        ) : (
          <button
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            className="flex w-full items-center justify-center rounded-lg py-1.5 text-sm text-text-muted hover:bg-surface-elevated hover:text-text-primary mb-1"
            title={locale === "zh" ? "Switch to English" : "\u5207\u6362\u5230\u4e2d\u6587"}
          >
            <Globe className="h-4 w-4" />
          </button>
        )}

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-elevated",
            collapsed ? "justify-center" : ""
          )}
          title={userEmail || "Guest"}
        >
          {userAvatarUrl ? (
            <Image
              src={userAvatarUrl}
              alt=""
              width={32}
              height={32}
              referrerPolicy="no-referrer"
              className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-border-faint"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-medium text-text-primary ring-1 ring-border-faint">
              {userInitials}
            </div>
          )}
          {!collapsed && (
            <div className="flex min-w-0 flex-col text-left">
              <span className="truncate text-sm font-medium text-text-primary">
                {userName || (userEmail ? userEmail.split('@')[0] : "Guest")}
              </span>
              <span className="truncate text-xs text-text-muted">
                {userEmail || t("sidebar.login_hint")}
              </span>
            </div>
          )}
        </button>

        {menuOpen && (
          <div
            className={cn(
              "absolute bottom-full mb-2 rounded-xl border border-glass-border bg-glass-bg glass-sidebar shadow-lg z-50",
              collapsed ? "left-0 w-48" : "left-2 right-2"
            )}
          >
            <a
              href="/history"
              onClick={() => { setMenuOpen(false); onNavigate?.(); }}
              className="flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-surface-elevated transition-colors rounded-t-xl"
            >
              <Clock className="h-4 w-4 text-text-secondary" />
              {t("sidebar.history")}
            </a>
            <div className="border-t border-border-faint" />
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-negative hover:bg-surface-elevated transition-colors rounded-b-xl"
            >
              <LogOut className="h-4 w-4" />
              {t("sidebar.logout")}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
