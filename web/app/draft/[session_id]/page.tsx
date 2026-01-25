"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Menu, X, ArrowLeft } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { cn } from "@/components/ui";
import { Sidebar } from "@/components/Sidebar";
import { ConversationTurnBlock } from "@/components/ConversationTurnBlock";
import { PromptInput } from "@/components/PromptInput";
import ReactMarkdown from "react-markdown";
import { useBattleStream } from "@/hooks/useBattleStream";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";

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
  conversation_history?: ConversationHistoryTurn[];
  turn_count?: number;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function DraftDetailPage() {
  const params = useParams();
  const router = useRouter();
  const session_id = params?.session_id as string;

  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [isVoted, setIsVoted] = useState(false);
  const [winnerSide, setWinnerSide] = useState<"left" | "right" | null>(null);
  const [voteId, setVoteId] = useState<string | null>(null);
  const [isVoting, setIsVoting] = useState(false);

  const [isStreaming, setIsStreaming] = useState(false);
  const [currentReply, setCurrentReply] = useState("");
  const [newTurns, setNewTurns] = useState<{
    turn_index: number;
    user_message: string;
    assistant_message: string;
    created_at: string;
  }[]>([]);

  // Pre-vote battle state
  const [currentTurn, setCurrentTurn] = useState(0);
  const [newBattleTurns, setNewBattleTurns] = useState<ConversationHistoryTurn[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState("");

  const {
    status: battleStatus,
    leftText,
    rightText,
    leftDone,
    rightDone,
    error: battleError,
    continueConversation,
  } = useBattleStream({
    onTurnUpdate: (turn) => setCurrentTurn(turn),
  });

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  // Fetch user info
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
      if (data.user?.id) setUserId(data.user.id);
    });
  }, []);

  // Fetch draft
  useEffect(() => {
    if (!session_id) return;

    let cancelled = false;

    async function fetchDraft() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/proxy/api/arena/draft/${session_id}`);
        const data = await res.json();

        if (!cancelled) {
          if (data.ok && data.draft) {
            setDraft(data.draft);
          } else {
            setError(data.error || "草稿不存在或已被删除");
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDraft();
    return () => {
      cancelled = true;
    };
  }, [session_id]);

  // Vote handler
  const handleVote = useCallback(async (choice: "left" | "right" | "tie" | "both_bad") => {
    if (!draft || !userId || isVoting) return;

    setIsVoting(true);

    try {
      // Convert position-based choice to arm-based vote
      let voteChoice: string;
      if (choice === "tie") {
        voteChoice = "tie";
      } else if (choice === "both_bad") {
        voteChoice = "both_bad";
      } else {
        // Determine which arm is on which side
        const leftArm = draft.model_config?.left?.arm || "baseline";
        const isLeftBaseline = leftArm === "baseline";

        if (choice === "left") {
          voteChoice = isLeftBaseline ? "model_a" : "model_b";
        } else {
          voteChoice = isLeftBaseline ? "model_b" : "model_a";
        }
      }

      // Use the dedicated draft vote endpoint (handles expired sessions)
      const res = await fetch(`/api/proxy/api/arena/draft/${draft.session_id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vote: voteChoice,
          user_id: userId,
          user_email: userEmail,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setIsVoted(true);
        setVoteId(data.vote_id);

        // Use winner_side from backend response
        if (data.winner_side === "left" || data.winner_side === "right") {
          setWinnerSide(data.winner_side);
        }

        // Redirect to chat page after a short delay
        if (data.vote_id && data.winner_side) {
          // Stay on page to allow continue chat
        } else {
          // For tie/both_bad, redirect to history
          setTimeout(() => {
            router.push("/history");
          }, 1500);
        }
      } else {
        setError(data.error || "投票失败");
      }
    } catch (err) {
      console.error("Vote error:", err);
      setError("投票失败，请重试");
    } finally {
      setIsVoting(false);
    }
  }, [draft, userId, userEmail, isVoting, router]);

  // Continue chat handler
  const handleContinueChat = useCallback(async (message: string) => {
    if (!draft?.session_id || isStreaming || !winnerSide) return;

    setIsStreaming(true);
    setCurrentReply("");

    try {
      const res = await fetch("/api/proxy/api/arena/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: draft.session_id,
          user_message: message,
        }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullReply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;

          try {
            const json = JSON.parse(data);
            if (json.delta) {
              fullReply += json.delta;
              setCurrentReply(fullReply);
            }
            if (json.type === "finish" || json.finish) {
              setNewTurns(prev => [...prev, {
                turn_index: prev.length + 1,
                user_message: message,
                assistant_message: fullReply,
                created_at: new Date().toISOString(),
              }]);
              setCurrentReply("");
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("Continue chat error:", err);
    } finally {
      setIsStreaming(false);
    }
  }, [draft?.session_id, isStreaming, winnerSide]);

  // Pre-vote continue conversation (dual model battle)
  const handlePreVoteContinue = useCallback(async (message: string) => {
    if (!draft?.session_id || battleStatus === "streaming") return;
    setCurrentPrompt(message);
    continueConversation(draft.session_id, message);
  }, [draft?.session_id, battleStatus, continueConversation]);

  // Save new battle turn when complete
  useEffect(() => {
    if (battleStatus === "done" && leftText && rightText && currentPrompt) {
      const newTurn: ConversationHistoryTurn = {
        turn: (draft?.conversation_history?.length || 1) + newBattleTurns.length + 1,
        user: currentPrompt,
        reply_a: leftText,
        reply_b: rightText,
      };
      setNewBattleTurns(prev => [...prev, newTurn]);
      setCurrentPrompt("");
    }
  }, [battleStatus, leftText, rightText, currentPrompt, draft?.conversation_history?.length, newBattleTurns.length]);

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
              <h1 className="text-sm font-semibold text-[var(--text-primary)]">
                {isVoted ? "投票完成" : "草稿详情"}
              </h1>
              {draft && (
                <p className="text-xs text-[var(--text-muted)]">
                  {formatTime(draft.updated_at)}
                </p>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
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
            ) : draft ? (
              <div className="space-y-6">
                {/* Render conversation turns */}
                {(() => {
                  return (draft.conversation_history && draft.conversation_history.length > 0
                    ? draft.conversation_history
                    : [{ turn: 1, user: draft.prompt, reply_a: draft.reply_a, reply_b: draft.reply_b }]
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
                      isRevealed={isVoted}
                      leftIsWinner={winnerSide === "left"}
                      rightIsWinner={winnerSide === "right"}
                      winnerSide={winnerSide}
                      isLastTurn={idx === arr.length - 1}
                    />
                  ));
                })()}

                {/* New battle turns (pre-vote) */}
                {newBattleTurns.map((turn) => (
                  <ConversationTurnBlock
                    key={`new-${turn.turn}`}
                    turnIndex={turn.turn}
                    userMessage={turn.user}
                    leftContent={turn.reply_a}
                    rightContent={turn.reply_b}
                    leftAnonymousLabel="Model A"
                    rightAnonymousLabel="Model B"
                    leftIsStreaming={false}
                    rightIsStreaming={false}
                    isRevealed={isVoted}
                    leftIsWinner={winnerSide === "left"}
                    rightIsWinner={winnerSide === "right"}
                    winnerSide={winnerSide}
                    isLastTurn={false}
                  />
                ))}

                {/* Current streaming battle turn (pre-vote) */}
                {battleStatus === "streaming" && currentPrompt && (
                  <ConversationTurnBlock
                    turnIndex={(draft?.conversation_history?.length || 1) + newBattleTurns.length + 1}
                    userMessage={currentPrompt}
                    leftContent={leftText}
                    rightContent={rightText}
                    leftAnonymousLabel="Model A"
                    rightAnonymousLabel="Model B"
                    leftIsStreaming={!leftDone}
                    rightIsStreaming={!rightDone}
                    isRevealed={false}
                    isLastTurn={true}
                  />
                )}

                {/* Post-vote continue chat turns */}
                {newTurns.map((turn) => (
                  <div key={turn.turn_index} className="space-y-4">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl bg-surface-elevated px-4 py-3 text-text-primary">
                        <div className="prose prose-sm prose-invert max-w-none">
                          <ReactMarkdown>{turn.user_message}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-xl text-text-secondary">
                        <div className="prose prose-sm prose-invert max-w-none">
                          <ReactMarkdown>{turn.assistant_message}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Streaming reply */}
                {(currentReply || isStreaming) && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl text-text-secondary">
                      <div className="prose prose-sm prose-invert max-w-none">
                        {currentReply ? (
                          <>
                            <ReactMarkdown>{currentReply}</ReactMarkdown>
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
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--border-color)] p-5">
                <p className="text-sm text-[var(--text-muted)]">草稿不存在</p>
              </div>
            )}
          </div>
        </main>

        {/* Vote buttons or Continue chat input */}
        {draft && !loading && !error && (
          <div className="sticky bottom-0 border-t border-border-faint bg-surface-primary/95 backdrop-blur-sm px-4 py-4">
            {!isVoted ? (
              <div className="mx-auto max-w-3xl space-y-4">
                {/* Pre-vote continue conversation input */}
                <PromptInput
                  onSubmit={handlePreVoteContinue}
                  disabled={battleStatus === "streaming"}
                  placeholder="继续对话，或选择下方投票..."
                />

                {/* Vote buttons */}
                <div className="border-t border-border-faint pt-4">
                  <p className="mb-3 text-center text-sm text-text-muted">
                    选择你认为更好的回复
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => handleVote("left")}
                      disabled={isVoting || battleStatus === "streaming"}
                      className={cn(
                        "rounded-xl px-4 py-3 text-sm font-medium transition-all",
                        "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400",
                        "text-white shadow-lg hover:shadow-xl",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      A is better
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVote("right")}
                      disabled={isVoting || battleStatus === "streaming"}
                      className={cn(
                        "rounded-xl px-4 py-3 text-sm font-medium transition-all",
                        "bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400",
                        "text-white shadow-lg hover:shadow-xl",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      B is better
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVote("tie")}
                      disabled={isVoting || battleStatus === "streaming"}
                      className={cn(
                        "rounded-xl px-4 py-3 text-sm font-medium transition-all",
                        "bg-zinc-700 hover:bg-zinc-600",
                        "text-white shadow-lg hover:shadow-xl",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      Tie
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVote("both_bad")}
                      disabled={isVoting || battleStatus === "streaming"}
                      className={cn(
                        "rounded-xl px-4 py-3 text-sm font-medium transition-all",
                        "bg-zinc-800 hover:bg-zinc-700 border border-zinc-600",
                        "text-zinc-300 shadow-lg hover:shadow-xl",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      Both bad
                    </button>
                  </div>
                  {isVoting && (
                    <p className="mt-3 text-center text-sm text-text-muted">
                      正在提交投票...
                    </p>
                  )}
                </div>
              </div>
            ) : winnerSide ? (
              /* Continue chat input - only if winner was selected */
              <div className="mx-auto max-w-3xl">
                <p className="mb-2 text-center text-xs text-[var(--text-muted)]">
                  投票成功！你选择了 Model {winnerSide === "left" ? "A" : "B"}，现在可以继续对话
                </p>
                <PromptInput
                  onSubmit={handleContinueChat}
                  disabled={isStreaming}
                  placeholder="继续与获胜模型对话..."
                />
              </div>
            ) : (
              /* Tie or both_bad - no continue chat */
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm text-[var(--text-muted)]">
                  投票成功！即将返回历史记录页面...
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
