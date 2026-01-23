"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Menu, X, ArrowLeft } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { cn } from "@/components/ui";
import { Sidebar } from "@/components/Sidebar";
import { ConversationTurnBlock } from "@/components/ConversationTurnBlock";

type VoteChoice = "model_a" | "model_b" | "tie" | "both_bad" | string;

type ConversationHistoryTurn = {
  turn: number;
  user: string;
  reply_a: string;
  reply_b: string;
  timestamp?: string;
};

type VoteRow = {
  id: string;
  created_at: string;
  session_id: string;
  prompt: string;
  reply_a: string;
  reply_b: string;
  user_vote: VoteChoice | null;
  conversation_history?: ConversationHistoryTurn[];
  turn_count?: number;
};

type PostVoteTurn = {
  id: string;
  turn_index: number;
  user_message: string;
  assistant_message: string;
  winner_side: string;
  created_at: string;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function ChatDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [vote, setVote] = useState<VoteRow | null>(null);
  const [postTurns, setPostTurns] = useState<PostVoteTurn[]>([]);
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

        // 查询包含多轮对话历史
        const { data, error: dbErr } = await supabase
          .from("votes")
          .select("id, created_at, session_id, prompt, reply_a, reply_b, user_vote, conversation_history, turn_count")
          .eq("id", id)
          .single();

        if (dbErr) throw dbErr;
        if (!data) throw new Error("记录不存在");

        if (!cancelled) {
          setVote(data as VoteRow);

          // Fetch post-vote turns
          const { data: turnsData, error: turnsErr } = await supabase
            .from("post_vote_turns")
            .select("*")
            .eq("vote_id", id)
            .order("turn_index", { ascending: true });

          if (turnsErr) {
            console.error("Error fetching post turns:", turnsErr);
          } else if (turnsData) {
            setPostTurns(turnsData as PostVoteTurn[]);
          }
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
          <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
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
                {/* 渲染所有对话轮次 */}
                {(vote.conversation_history && vote.conversation_history.length > 0
                  ? vote.conversation_history
                  : [{ turn: 1, user: vote.prompt, reply_a: vote.reply_a, reply_b: vote.reply_b }]
                ).map((turn, idx, arr) => (
                  <ConversationTurnBlock
                    key={turn.turn}
                    turnIndex={turn.turn}
                    userMessage={turn.user}
                    leftContent={turn.reply_a}
                    rightContent={turn.reply_b}
                    leftAnonymousLabel="Model A"
                    rightAnonymousLabel="Model B"
                    leftIsStreaming={false}
                    rightIsStreaming={false}
                    isRevealed={true}
                    leftIsWinner={vote.user_vote === "model_a"}
                    rightIsWinner={vote.user_vote === "model_b"}
                    winnerSide={
                      vote.user_vote === "model_a" ? "left" :
                      vote.user_vote === "model_b" ? "right" : null
                    }
                    isLastTurn={idx === arr.length - 1}
                    postVoteTurns={idx === arr.length - 1 ? postTurns.map(t => ({
                      turn_index: t.turn_index,
                      user_message: t.user_message,
                      assistant_message: t.assistant_message,
                      created_at: t.created_at,
                    })) : undefined}
                  />
                ))}
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
