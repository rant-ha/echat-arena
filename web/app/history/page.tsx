"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { History, Menu, X, ChevronRight, MessageSquare } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { cn } from "@/components/ui";
import { Sidebar } from "@/components/Sidebar";

type VoteChoice = "model_a" | "model_b" | "tie" | "both_bad" | string;

type ModelConfig = {
  left?: { arm?: string; model_id?: string };
  right?: { arm?: string; model_id?: string };
  [key: string]: unknown;
};

type VoteRow = {
  id: string;
  created_at: string;
  prompt: string;
  user_vote: VoteChoice | null;
  model_config?: ModelConfig | null;
};

type DraftRow = {
  id: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  prompt: string;
  reply_a: string;
  reply_b: string;
  model_a: string;
  model_b: string;
  model_config?: ModelConfig | null;
  turn_count?: number;
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

/**
 * Convert arm-based vote (model_a=baseline, model_b=strategy) to position (left/right).
 * model_config.left.arm tells us which arm is on the left side.
 */
function getVotePosition(vote: VoteChoice | null, modelConfig?: ModelConfig | null): "left" | "right" | null {
  if (!vote || vote === "tie" || vote === "both_bad") return null;

  const leftArm = modelConfig?.left?.arm || "baseline";
  const isLeftBaseline = leftArm === "baseline";

  if (vote === "model_a") {  // voted for baseline
    return isLeftBaseline ? "left" : "right";
  } else if (vote === "model_b") {  // voted for strategy
    return isLeftBaseline ? "right" : "left";
  }
  return null;
}

function voteLabel(v: VoteChoice | null, modelConfig?: ModelConfig | null): string {
  if (!v) return "未投票";
  if (v === "tie") return "平局";
  if (v === "both_bad") return "都不行";

  const position = getVotePosition(v, modelConfig);
  if (position === "left") return "选了 Model A";
  if (position === "right") return "选了 Model B";

  return String(v);
}

export default function HistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<VoteRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  useEffect(() => {
    // Fetch user info for sidebar & logic
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
       if (data.user?.email) setUserEmail(data.user.email);
       const meta = data.user?.user_metadata;
       if (meta?.full_name) setUserName(meta.full_name);
       if (meta?.avatar_url) setUserAvatarUrl(meta.avatar_url);
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

        // 查询必要字段，包含 model_config 用于正确显示投票位置
        const { data, error: dbErr } = await supabase
          .from("votes")
          .select("id, created_at, prompt, user_vote, model_config")
          .eq("user_id", user.id)
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

  // Load drafts
  useEffect(() => {
    let cancelled = false;

    async function loadDrafts() {
      try {
        const supabase = createSupabaseBrowserClient();

        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser();

        if (authErr || !user) return;

        const draftRes = await fetch(`/api/proxy/api/arena/drafts?user_id=${user.id}`);
        const draftData = await draftRes.json();

        if (!cancelled && draftData.ok && draftData.drafts) {
          setDrafts(draftData.drafts);
        }
      } catch (err) {
        console.warn("Failed to load drafts:", err);
      }
    }

    loadDrafts();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = (id: string) => {
    router.push(`/chat/${id}`);
  };

  return (
    <div className="flex min-h-screen bg-surface-primary text-text-primary">
      {/* Desktop sidebar */}
      <div className="hidden md:block md:w-[260px] md:shrink-0">
        <div className="sticky top-0 h-screen">
          <Sidebar className="h-screen" userEmail={userEmail} userName={userName} userAvatarUrl={userAvatarUrl} />
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
            <Sidebar className="h-full" onNavigate={closeSidebar} userEmail={userEmail} userName={userName} userAvatarUrl={userAvatarUrl} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-surface-primary/80 backdrop-blur-md border-b border-border-faint">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={sidebarOpen ? closeSidebar : openSidebar}
              className={cn(
                "md:hidden",
                "inline-flex h-10 w-10 items-center justify-center rounded-lg",
                "hover:bg-surface-elevated transition-colors",
                "text-text-primary"
              )}
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-text-muted" />
              <div>
                <h1 className="text-sm font-semibold text-text-primary">
                  History
                </h1>
                <p className="hidden text-xs text-text-muted sm:block">
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
              <div className="rounded-xl border border-border-faint p-5">
                <p className="text-sm text-text-muted">加载中…</p>
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-5">
                <p className="text-sm text-red-300">{error}</p>
                <p className="mt-2 text-xs text-text-muted">
                  如果你刚登录/注册，刷新一次页面通常即可（依赖 Supabase cookie 同步）。
                </p>
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-border-faint p-5">
                <p className="text-sm text-text-muted">
                  暂无历史记录。去 <a className="text-interactive-accent hover:underline" href="/battle">/battle</a> 完成一次投票后再来。
                </p>
              </div>
            ) : (
              <>
                {/* Drafts Section */}
                {drafts.length > 0 && (
                  <div className="mb-8">
                    <h2 className="mb-3 text-sm font-medium text-text-muted">
                      未投票的对话
                    </h2>
                    <div className="space-y-2">
                      {drafts.map((draft) => (
                        <button
                          key={draft.id}
                          type="button"
                          onClick={() => router.push(`/draft/${draft.session_id}`)}
                          className={cn(
                            "flex w-full items-center gap-4 rounded-xl border border-glass-border bg-glass-bg glass-surface p-4",
                            "text-left transition-all hover:border-border-strong hover:bg-surface-elevated/30"
                          )}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-500/20">
                            <MessageSquare className="h-5 w-5 text-yellow-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <p className="line-clamp-1 text-sm font-medium text-text-primary">
                                {truncate(draft.prompt, 80)}
                              </p>
                              <span className="shrink-0 rounded bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-500">
                                未投票
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                              <span>{formatTime(draft.updated_at)}</span>
                              <span>•</span>
                              <span>
                                {draft.model_a} vs {draft.model_b}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Voted History Section */}
                <div>
                  {rows.length > 0 && (
                    <h2 className="mb-3 text-sm font-medium text-text-muted">
                      投票历史
                    </h2>
                  )}
                  <div className="space-y-2">
                    {rows.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleClick(r.id)}
                        className={cn(
                          "flex w-full items-center gap-4 rounded-xl border border-glass-border bg-glass-bg p-4",
                          "text-left transition-all hover:border-border-strong hover:bg-surface-elevated/30"
                        )}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-elevated">
                          <MessageSquare className="h-5 w-5 text-text-muted" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-sm font-medium text-text-primary">
                            {truncate(r.prompt, 80)}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                            <span>{formatTime(r.created_at)}</span>
                            <span>•</span>
                            <span>{voteLabel(r.user_vote, r.model_config)}</span>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
