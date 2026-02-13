"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Menu, X, ArrowLeft } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { cn } from "@/components/ui";
import { Sidebar } from "@/components/Sidebar";
import { ConversationTurnBlock } from "@/components/ConversationTurnBlock";
import { PromptInput } from "@/components/PromptInput";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { usePostVoteChat } from "@/hooks/usePostVoteChat";

type VoteChoice = "model_a" | "model_b" | "tie" | "both_bad" | string;

type ModelConfig = {
  left?: { arm?: string; model_id?: string };
  right?: { arm?: string; model_id?: string };
  [key: string]: unknown;
};

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
  model_config?: ModelConfig | null;
  conversation_history?: ConversationHistoryTurn[];
  turn_count?: number;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function getVotePosition(vote: VoteChoice | null, modelConfig?: ModelConfig | null): "left" | "right" | null {
  if (!vote || vote === "tie" || vote === "both_bad") return null;

  const leftArm = modelConfig?.left?.arm || "baseline";
  const isLeftBaseline = leftArm === "baseline";

  if (vote === "model_a") {
    return isLeftBaseline ? "left" : "right";
  } else if (vote === "model_b") {
    return isLeftBaseline ? "right" : "left";
  }
  return null;
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
  const [userName, setUserName] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  const [searchEnabled, setSearchEnabled] = useState(false);
  const toggleSearch = useCallback(() => setSearchEnabled(prev => !prev), []);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  const canContinue = (vote?.user_vote === "model_a" || vote?.user_vote === "model_b") && !!vote?.session_id;
  const winnerPosition = vote ? getVotePosition(vote.user_vote, vote.model_config) : null;

  // ===== Post-vote chat via shared Hook =====
  const {
    turns: postTurns,
    currentReply,
    isChatting: isStreaming,
    pendingMessage: pendingUserMessage,
    historyLoaded,
    historyError,
    sendError,
    retryHistory,
    sendMessage: handleContinueChat,
  } = usePostVoteChat({
    sessionId: vote?.session_id || null,
    initialVoteId: id,
    searchEnabled,
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
      const meta = data.user?.user_metadata;
      if (meta?.full_name) setUserName(meta.full_name);
      if (meta?.avatar_url) setUserAvatarUrl(meta.avatar_url);
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

        const { data, error: dbErr } = await supabase
          .from("votes")
          .select("id, created_at, session_id, prompt, reply_a, reply_b, user_vote, model_config, conversation_history, turn_count")
          .eq("id", id)
          .eq("user_id", user.id)
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

            <button
              type="button"
              onClick={() => router.back()}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-lg",
                "hover:bg-surface-elevated transition-colors",
                "text-text-primary"
              )}
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div>
              <h1 className="text-sm font-semibold text-text-primary">Chat</h1>
              {vote && (
                <p className="text-xs text-text-muted">
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
              <div className="rounded-xl border border-border-faint p-5">
                <p className="text-sm text-text-muted">加载中…</p>
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-5">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            ) : vote ? (
              <div className="space-y-6">
                {/* Pre-vote conversation turns */}
                {(vote.conversation_history && vote.conversation_history.length > 0
                  ? vote.conversation_history
                  : [{ turn: 1, user: vote.prompt, reply_a: vote.reply_a, reply_b: vote.reply_b }]
                ).map((turn) => (
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
                    leftIsWinner={winnerPosition === "left"}
                    rightIsWinner={winnerPosition === "right"}
                    winnerSide={winnerPosition}
                  />
                ))}

                {/* Post-vote history loading state */}
                {canContinue && !historyLoaded && !historyError && (
                  <div className="flex items-center justify-center py-6">
                    <p className="text-sm text-text-muted">加载对话历史...</p>
                  </div>
                )}

                {/* Post-vote history error state */}
                {historyError && (
                  <div className="flex items-center justify-center gap-3 py-6">
                    <p className="text-sm text-red-400">加载对话历史失败</p>
                    <button
                      type="button"
                      onClick={retryHistory}
                      className="text-sm text-text-muted underline hover:text-text-primary transition-colors"
                    >
                      重试
                    </button>
                  </div>
                )}

                {/* ===== Post-vote chat — FULL WIDTH ===== */}
                {postTurns.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 py-2">
                      <div className="flex-1 h-px bg-border-faint" />
                      <span className="text-xs font-medium text-interactive-accent uppercase tracking-wider">
                        Continued Chat
                      </span>
                      <div className="flex-1 h-px bg-border-faint" />
                    </div>
                  </div>
                )}

                {postTurns.map((turn) => (
                  <div key={`pv-${turn.turn_index}`} className="space-y-4">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl bg-surface-elevated px-4 py-3 text-text-primary">
                        <div className="prose prose-sm prose-invert max-w-none">
                          <MarkdownRenderer>{turn.user_message}</MarkdownRenderer>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-xl text-text-secondary">
                        <div className="prose prose-sm prose-invert max-w-none">
                          <MarkdownRenderer>{turn.assistant_message}</MarkdownRenderer>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Pending user message */}
                {pendingUserMessage && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-surface-elevated px-4 py-3 text-text-primary">
                      <div className="prose prose-sm prose-invert max-w-none">
                        <MarkdownRenderer>{pendingUserMessage}</MarkdownRenderer>
                      </div>
                    </div>
                  </div>
                )}

                {/* Streaming reply */}
                {(currentReply || isStreaming) && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl text-text-secondary">
                      <div className="prose prose-sm prose-invert max-w-none">
                        {currentReply ? (
                          <>
                            <MarkdownRenderer>{currentReply}</MarkdownRenderer>
                            {isStreaming && (
                              <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-interactive-accent align-middle" />
                            )}
                          </>
                        ) : (
                          <ThinkingIndicator showSkeleton={false} />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Send error display */}
                {sendError && !isStreaming && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3">
                      <p className="text-sm text-red-300">
                        {sendError === "session_expired" ? "会话已过期，请返回重新开始" :
                         sendError === "stream_timeout" ? "回复超时，请重试" :
                         sendError === "save_failed" ? "回复保存失败" :
                         `发送失败: ${sendError}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-border-faint p-5">
                <p className="text-sm text-text-muted">记录不存在</p>
              </div>
            )}
          </div>
        </main>

        {/* Continue chat input */}
        {canContinue && (
          <div className="sticky bottom-0 border-t border-border-faint bg-surface-primary/95 backdrop-blur-sm px-4 py-4">
            <PromptInput
              onSubmit={handleContinueChat}
              disabled={isStreaming || loading}
              searchEnabled={searchEnabled}
              onSearchToggle={toggleSearch}
              placeholder="继续与获胜模型对话..."
            />
          </div>
        )}
      </div>
    </div>
  );
}
