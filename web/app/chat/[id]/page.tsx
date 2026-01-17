"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Menu, X, ArrowLeft, User, Bot, Check } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { cn } from "@/components/ui";
import { Sidebar } from "@/components/Sidebar";

type VoteChoice = "model_a" | "model_b" | "tie" | "both_bad" | string;

type VoteRow = {
  id: string;
  created_at: string;
  session_id: string;
  prompt: string;
  reply_a: string;
  reply_b: string;
  user_vote: VoteChoice | null;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/**
 * UserBubble - 用户消息气泡，右侧对齐
 */
function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[85%] items-start gap-3 md:max-w-[70%]">
        <div className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-white">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500">
          <User className="h-4 w-4 text-white" />
        </div>
      </div>
    </div>
  );
}

/**
 * AIBubble - 单个AI回复气泡
 */
function AIBubble({
  label,
  content,
  isSelected,
}: {
  label: string;
  content: string;
  isSelected: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-4 transition-all",
        isSelected
          ? "border-green-500 bg-green-500/10 ring-2 ring-green-500/30"
          : "border-[var(--border-color)] bg-[var(--sidebar-bg)]"
      )}
    >
      {/* Header with label and selected badge */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
            <Bot className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          </div>
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {label}
          </span>
        </div>
        {isSelected && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
            <Check className="h-3 w-3" />
            Selected
          </span>
        )}
      </div>
      {/* Content */}
      <div className="flex-1">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]/90">
          {content}
        </p>
      </div>
    </div>
  );
}

/**
 * DualBubble - 双回复容器，展示 Reply A 和 Reply B
 */
function DualBubble({
  replyA,
  replyB,
  userVote,
}: {
  replyA: string;
  replyB: string;
  userVote: VoteChoice | null;
}) {
  // 根据 user_vote 判断哪个被选中
  const aSelected = userVote === "model_a";
  const bSelected = userVote === "model_b";

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
        <Bot className="h-4 w-4 text-[var(--text-muted)]" />
      </div>
      <div className="min-w-0 flex-1">
        {/* 桌面端并排，移动端垂直 */}
        <div className="grid gap-4 md:grid-cols-2">
          <AIBubble label="Reply A" content={replyA} isSelected={aSelected} />
          <AIBubble label="Reply B" content={replyB} isSelected={bSelected} />
        </div>
        {/* 投票结果提示 */}
        {userVote && (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {userVote === "tie"
              ? "你认为两者平局"
              : userVote === "both_bad"
              ? "你认为两者都不满意"
              : `你选择了 ${aSelected ? "Reply A" : "Reply B"} 作为更好的回答`}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ChatDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [vote, setVote] = useState<VoteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  useEffect(() => {
    // Fetch user info for sidebar
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function fetchVote() {
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
          .select("id, created_at, session_id, prompt, reply_a, reply_b, user_vote")
          .eq("id", id)
          .single();

        if (dbErr) throw dbErr;
        if (!data) throw new Error("记录不存在");

        if (!cancelled) {
          setVote(data as VoteRow);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchVote();
    return () => {
      cancelled = true;
    };
  }, [id]);

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

            <button
              type="button"
              onClick={() => router.back()}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-lg",
                "hover:bg-white/10 transition-colors",
                "text-[var(--text-primary)]"
              )}
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div>
              <h1 className="text-sm font-semibold text-[var(--text-primary)]">Chat</h1>
              {vote && (
                <p className="text-xs text-[var(--text-muted)]">
                  {formatTime(vote.created_at)}
                </p>
              )}
            </div>
          </div>
        </header>

        {/* Chat Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
            {loading ? (
              <div className="rounded-xl border border-[var(--border-color)] p-5">
                <p className="text-sm text-[var(--text-muted)]">加载中…</p>
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-5">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            ) : vote ? (
              <div className="space-y-6">
                {/* User message */}
                <UserBubble content={vote.prompt} />

                {/* AI dual reply */}
                <DualBubble
                  replyA={vote.reply_a}
                  replyB={vote.reply_b}
                  userVote={vote.user_vote}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--border-color)] p-5">
                <p className="text-sm text-[var(--text-muted)]">记录不存在</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
