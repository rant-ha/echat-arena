"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Menu, X, ArrowLeft } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { cn } from "@/components/ui";
import { Sidebar } from "@/components/Sidebar";
import { ConversationTurnBlock } from "@/components/ConversationTurnBlock";
import { PromptInput } from "@/components/PromptInput";
import { ModelSelector } from "@/components/ModelSelector";
import { useBattleStream } from "@/hooks/useBattleStream";

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
  const [userName, setUserName] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [isVoting, setIsVoting] = useState(false);

  // Save status tracking for draft updates
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");

  // Pre-vote battle state
  const [currentTurn, setCurrentTurn] = useState(0);
  const [newBattleTurns, setNewBattleTurns] = useState<ConversationHistoryTurn[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState("");

  // Model selector state
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [defaultModelKey, setDefaultModelKey] = useState<string | null>(null);
  const MODEL_STORAGE_KEY = "echat-arena-v1-selected-model";

  // Web search toggle state
  const [searchEnabled, setSearchEnabled] = useState(false);
  const toggleSearch = useCallback(() => setSearchEnabled(prev => !prev), []);

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

  // Post-vote local state (redirect-only, no inline chat)
  const [voteId, setVoteId] = useState<string | null>(null);
  const [winnerSide, setWinnerSide] = useState<"left" | "right" | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState(false);
  const isVoted = !!voteId;  // pendingRedirect does NOT affect reveal/header

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  // Load model selection from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(MODEL_STORAGE_KEY);
      if (stored) setSelectedModelKey(stored);
    } catch {}
  }, []);

  // Handle model change
  const handleModelChange = useCallback((modelKey: string) => {
    setSelectedModelKey(modelKey);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, modelKey);
    } catch {}
  }, []);

  // Handle default model loaded from API
  const handleDefaultModelLoaded = useCallback((defaultKey: string | null) => {
    setDefaultModelKey(defaultKey);
    if (!selectedModelKey && defaultKey) {
      setSelectedModelKey(defaultKey);
    }
  }, [selectedModelKey]);

  // Fetch user info
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
      if (data.user?.id) setUserId(data.user.id);
      const meta = data.user?.user_metadata;
      if (meta?.full_name) setUserName(meta.full_name);
      if (meta?.avatar_url) setUserAvatarUrl(meta.avatar_url);
    });
  }, []);

  // Fetch draft
  useEffect(() => {
    if (!session_id) return;

    let cancelled = false;

    async function fetchDraft() {
      setLoading(true);
      setError(null);
      // Clear stale state to prevent cross-session contamination
      setDraft(null);
      setVoteId(null);
      setWinnerSide(null);
      setPendingRedirect(false);

      try {
        const res = await fetch(`/api/proxy/api/arena/draft/${session_id}`);
        const data = await res.json();

        if (!cancelled) {
          if (data.ok && data.draft) {
            setDraft(data.draft);
            // Restore draft session to SessionStore for pre-vote continuation
            // This is critical: without this, /api/arena/continue will return 400 "Invalid session"
            try {
              await fetch(`/api/proxy/api/arena/draft/${session_id}/restore`, {
                method: "POST",
              });
            } catch (err) {
              console.warn("Failed to restore session for continuation:", err);
            }
          } else if (res.status === 404 && data.vote_id) {
            // Exact match: only 404 + vote_id enters "voted/can redirect" branch
            setVoteId(data.vote_id);
          } else if (!data.ok) {
            // Real errors (500/401/other 4xx without vote_id) → error UI
            setError(data.error || "加载失败");
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
      let voteChoice: string;
      if (choice === "tie") {
        voteChoice = "tie";
      } else if (choice === "both_bad") {
        voteChoice = "both_bad";
      } else {
        const leftArm = draft.model_config?.left?.arm || "baseline";
        const isLeftBaseline = leftArm === "baseline";

        if (choice === "left") {
          voteChoice = isLeftBaseline ? "model_a" : "model_b";
        } else {
          voteChoice = isLeftBaseline ? "model_b" : "model_a";
        }
      }

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
        if (data.vote_id) {
          // 有 vote_id 就设置并跳转到 /chat/[vote_id]
          setVoteId(data.vote_id);
          if (data.winner_side === "left" || data.winner_side === "right") {
            setWinnerSide(data.winner_side);
          }
          // 自动跳转到 /chat/[vote_id]
          setTimeout(() => {
            try {
              router.push(`/chat/${data.vote_id}`);
            } catch (err) {
              console.error("Redirect failed:", err);
              setError("跳转失败，请手动点击按钮查看");
            }
          }, 800);
        } else {
          // 没有 vote_id: 跳转到历史页
          setPendingRedirect(true);
          setTimeout(() => {
            try {
              router.push("/history");
            } catch (err) {
              console.error("Redirect failed:", err);
              setError("跳转失败，请手动刷新页面");
            }
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

  // Pre-vote continue conversation (dual model battle)
  const handlePreVoteContinue = useCallback(async (message: string) => {
    if (!draft?.session_id || battleStatus === "streaming") return;
    setCurrentPrompt(message);
    const modelToUse = selectedModelKey || defaultModelKey || undefined;
    continueConversation(draft.session_id, message, modelToUse, searchEnabled);
  }, [draft?.session_id, battleStatus, continueConversation, selectedModelKey, defaultModelKey, searchEnabled]);

  // Save draft update to database when new battle turn is complete
  const saveDraftUpdate = useCallback(async (newTurn: ConversationHistoryTurn, allTurns: ConversationHistoryTurn[]) => {
    if (!draft?.session_id) return;

    // Ensure userId is available before attempting save
    if (!userId) {
      console.warn("[saveDraftUpdate] userId is null, skipping save for session:", draft.session_id);
      return;
    }

    setSaveStatus("saving");

    try {
      const res = await fetch("/api/proxy/api/arena/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: draft.session_id,
          user_id: userId,
          user_email: userEmail,
          prompt: draft.prompt,
          reply_a: newTurn.reply_a,
          reply_b: newTurn.reply_b,
          model_a: draft.model_a,
          model_b: draft.model_b,
          conversation_history: allTurns,
          turn_count: allTurns.length,
          model_config: draft.model_config,
        }),
      });

      // Response validation: check HTTP status
      if (!res.ok) {
        const errorText = await res.text();
        console.error("[saveDraftUpdate] HTTP error:", res.status, errorText);
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 5000);
        return;
      }

      // Parse JSON response
      const data = await res.json();

      // Verify data.ok === true
      if (!data.ok) {
        console.error("[saveDraftUpdate] API error:", data.error);
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 5000);
        return;
      }

      // Success
      console.debug("[saveDraftUpdate] Draft saved successfully for session:", draft.session_id);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[saveDraftUpdate] Network error:", errorMessage);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 5000);
    }
  }, [draft?.session_id, draft?.prompt, draft?.model_a, draft?.model_b, draft?.model_config, userId, userEmail]);

  // Save new battle turn when complete
  useEffect(() => {
    if (battleStatus === "done" && leftText && rightText && currentPrompt) {
      const newTurn: ConversationHistoryTurn = {
        turn: (draft?.conversation_history?.length || 1) + newBattleTurns.length + 1,
        user: currentPrompt,
        reply_a: leftText,
        reply_b: rightText,
      };

      const allTurns = [...(draft?.conversation_history || []), ...newBattleTurns, newTurn];

      setNewBattleTurns(prev => [...prev, newTurn]);
      setCurrentPrompt("");

      if (draft?.session_id) saveDraftUpdate(newTurn, allTurns);
    }
  }, [battleStatus, leftText, rightText, currentPrompt, draft?.conversation_history, newBattleTurns, draft?.session_id, saveDraftUpdate]);

  // Cleanup effect: Clear currentPrompt after 5 seconds when battleStatus === "error"
  // This prevents stale messages from persisting after a failed battle
  useEffect(() => {
    if (battleStatus === "error") {
      const timeoutId = setTimeout(() => {
        setCurrentPrompt("");
      }, 5000);

      return () => clearTimeout(timeoutId);
    }
  }, [battleStatus]);

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

            {!isVoted && (
              <ModelSelector
                selectedModelKey={selectedModelKey}
                onModelChange={handleModelChange}
                onDefaultLoaded={handleDefaultModelLoaded}
                disabled={battleStatus === "streaming"}
              />
            )}

            <div>
              <h1 className="text-sm font-semibold text-text-primary">
                {isVoted ? "投票完成" : "草稿详情"}
              </h1>
              {draft && (
                <p className="text-xs text-text-muted">
                  {formatTime(draft.updated_at)}
                </p>
              )}
            </div>
          </div>
        </header>

        {/* Save Status Notification */}
        {saveStatus !== "idle" && (
          <div className="fixed top-20 right-4 z-50 animate-in slide-in-from-right">
            <div
              className={cn(
                "rounded-lg px-4 py-3 shadow-lg border",
                "flex items-center gap-2 text-sm font-medium",
                saveStatus === "saving" && "bg-blue-500/10 border-blue-500/30 text-blue-300",
                saveStatus === "success" && "bg-green-500/10 border-green-500/30 text-green-300",
                saveStatus === "error" && "bg-red-500/10 border-red-500/30 text-red-300"
              )}
            >
              {saveStatus === "saving" && (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />
                  <span>保存中...</span>
                </>
              )}
              {saveStatus === "success" && (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>保存成功</span>
                </>
              )}
              {saveStatus === "error" && (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>保存失败</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Content */}
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
            ) : battleError ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-5">
                <p className="text-sm text-red-300">对话生成失败: {battleError}</p>
              </div>
            ) : draft ? (
              <div className="space-y-6">
                {/* Pre-vote conversation turns */}
                {(draft.conversation_history && draft.conversation_history.length > 0
                  ? draft.conversation_history
                  : [{ turn: 1, user: draft.prompt, reply_a: draft.reply_a, reply_b: draft.reply_b }]
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
                    isRevealed={isVoted}
                    leftIsWinner={winnerSide === "left"}
                    rightIsWinner={winnerSide === "right"}
                    winnerSide={winnerSide}
                  />
                ))}

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
                  />
                ))}

                {/* Current streaming battle turn (pre-vote) */}
                {/* Show turn when streaming OR error to ensure failed turns are visible */}
                {(battleStatus === "streaming" || battleStatus === "error") && currentPrompt && (
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
                    error={battleStatus === "error" ? (battleError || undefined) : undefined}
                  />
                )}

              </div>
            ) : voteId ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <p className="text-sm text-text-muted">此草稿已完成投票</p>
                <button
                  type="button"
                  onClick={() => router.push(`/chat/${voteId}`)}
                  className={cn(
                    "rounded-xl px-4 py-3 text-sm font-medium transition-all",
                    "bg-surface-tertiary hover:bg-interactive-accent border border-border-strong",
                    "text-text-secondary hover:text-white shadow-lg hover:shadow-xl"
                  )}
                >
                  查看投票详情 &amp; 继续对话 →
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-border-faint p-5">
                <p className="text-sm text-text-muted">草稿不存在</p>
              </div>
            )}
          </div>
        </main>

        {/* Vote buttons or Continue chat input */}
        {(draft || voteId) && !loading && !error && (
          <div className="sticky bottom-0 border-t border-border-faint bg-surface-primary/95 backdrop-blur-sm px-4 py-4">
            {!isVoted && !pendingRedirect ? (
              <div className="mx-auto max-w-3xl space-y-4">
                <PromptInput
                  onSubmit={handlePreVoteContinue}
                  disabled={battleStatus === "streaming"}
                  placeholder="继续对话，或选择下方投票..."
                  searchEnabled={searchEnabled}
                  onSearchToggle={toggleSearch}
                />

                <div className="border-t border-border-faint pt-4">
                  <p className="mb-3 text-center text-sm text-text-muted">
                    选择你认为更好的回复
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => handleVote("left")}
                      disabled={isVoting || battleStatus === "streaming" || pendingRedirect}
                      className={cn(
                        "rounded-xl px-4 py-3 text-sm font-medium transition-all",
                        "bg-surface-tertiary hover:bg-interactive-accent border border-border-strong",
                        "text-text-secondary hover:text-white shadow-lg hover:shadow-xl",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      A is better
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVote("right")}
                      disabled={isVoting || battleStatus === "streaming" || pendingRedirect}
                      className={cn(
                        "rounded-xl px-4 py-3 text-sm font-medium transition-all",
                        "bg-surface-tertiary hover:bg-interactive-accent border border-border-strong",
                        "text-text-secondary hover:text-white shadow-lg hover:shadow-xl",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      B is better
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVote("tie")}
                      disabled={isVoting || battleStatus === "streaming" || pendingRedirect}
                      className={cn(
                        "rounded-xl px-4 py-3 text-sm font-medium transition-all",
                        "bg-surface-tertiary hover:bg-surface-elevated border border-border-strong",
                        "text-text-secondary shadow-lg hover:shadow-xl",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      Tie
                    </button>
                    <button
                      type="button"
                      onClick={() => handleVote("both_bad")}
                      disabled={isVoting || battleStatus === "streaming" || pendingRedirect}
                      className={cn(
                        "rounded-xl px-4 py-3 text-sm font-medium transition-all",
                        "bg-surface-tertiary hover:bg-negative border border-border-strong",
                        "text-text-secondary hover:text-white shadow-lg hover:shadow-xl",
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
            ) : voteId ? (
              <div className="mx-auto max-w-3xl text-center space-y-3">
                <p className="text-sm text-text-muted">
                  投票成功！{winnerSide ? `你选择了 Model ${winnerSide === "left" ? "A" : "B"}` : ""}
                </p>
                <button
                  type="button"
                  onClick={() => router.push(`/chat/${voteId}`)}
                  className={cn(
                    "rounded-xl px-4 py-3 text-sm font-medium transition-all",
                    "bg-surface-tertiary hover:bg-interactive-accent border border-border-strong",
                    "text-text-secondary hover:text-white shadow-lg hover:shadow-xl"
                  )}
                >
                  继续与获胜模型对话 →
                </button>
              </div>
            ) : pendingRedirect ? (
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm text-text-muted">
                  投票成功！即将返回历史记录页面...
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
