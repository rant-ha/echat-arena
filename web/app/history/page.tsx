"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { History, Menu, X, ChevronRight, MessageSquare } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { cn } from "@/components/ui";
import { Sidebar } from "@/components/Sidebar";

type VoteChoice = "model_a" | "model_b" | "tie" | "both_bad" | string;

type VoteRow = {
  id: string;
  created_at: string;
  prompt: string;
  user_vote: VoteChoice | null;
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

function voteLabel(v: VoteChoice | null): string {
  if (!v) return "未投票";
  if (v === "model_a") return "选了 Reply A";
  if (v === "model_b") return "选了 Reply B";
  if (v === "tie") return "平局";
  if (v === "both_bad") return "都不行";
  return String(v);
}

export default function HistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<VoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  useEffect(() => {
    // Fetch user info for sidebar & logic
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
       if (data.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const supabase = createSupabaseBrowserClient();

        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser();

        if (authErr) throw authErr;
        if (!user) throw new Error("未登录");

        // 只查询必要字段，不查询 ai_scores 和 model_config
        const { data, error: dbErr } = await supabase
          .from("votes")
          .select("id, created_at, prompt, user_vote")
          .order("created_at", { ascending: false })
          .limit(100);

        if (dbErr) throw dbErr;

        if (!cancelled) {
          setRows((data as VoteRow[]) || []);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = (id: string) => {
    router.push(`/chat/${id}`);
  };

  return (
    <div className="flex min-h-screen bg-[var(--main-bg)] text-[var(--text-primary)]">
      {/* Desktop sidebar */}
      <div className="hidden md:block md:w-[260px] md:shrink-0">
        <div className="sticky top-0 h-screen">
          <Sidebar className="h-screen" userEmail={userEmail} />
        </div>
      </div>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            className="absolute inset-0 bg-black/50"
            onClick={closeSidebar}
          />
          <div className="absolute left-0 top-0 h-full w-[86vw] max-w-[320px]">
            <Sidebar className="h-full" onNavigate={closeSidebar} userEmail={userEmail} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[var(--main-bg)]/80 backdrop-blur-md border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={sidebarOpen ? closeSidebar : openSidebar}
              className={cn(
                "md:hidden",
                "inline-flex h-10 w-10 items-center justify-center rounded-lg",
                "hover:bg-white/10 transition-colors",
                "text-[var(--text-primary)]"
              )}
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-[var(--text-muted)]" />
              <div>
                <h1 className="text-sm font-semibold text-[var(--text-primary)]">
                  History
                </h1>
                <p className="hidden text-xs text-[var(--text-muted)] sm:block">
                  共 {rows.length} 条对话记录
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* List Content */}
        <main className="flex-1 overflow-y-auto pb-10">
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
            {loading ? (
              <div className="rounded-xl border border-[var(--border-color)] p-5">
                <p className="text-sm text-[var(--text-muted)]">加载中…</p>
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-5">
                <p className="text-sm text-red-300">{error}</p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  如果你刚登录/注册，刷新一次页面通常即可（依赖 Supabase cookie 同步）。
                </p>
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-[var(--border-color)] p-5">
                <p className="text-sm text-[var(--text-muted)]">
                  暂无历史记录。去 <a className="text-primary hover:underline" href="/battle">/battle</a> 完成一次投票后再来。
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleClick(r.id)}
                    className={cn(
                      "flex w-full items-center gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--sidebar-bg)] p-4",
                      "text-left transition-all hover:border-[var(--text-muted)] hover:bg-white/5"
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
                      <MessageSquare className="h-5 w-5 text-[var(--text-muted)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-medium text-[var(--text-primary)]">
                        {truncate(r.prompt, 80)}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span>{formatTime(r.created_at)}</span>
                        <span>•</span>
                        <span>{voteLabel(r.user_vote)}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
