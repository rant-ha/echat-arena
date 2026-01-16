"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Swords, RotateCcw, Menu, X, ChevronDown } from "lucide-react";
import { useBattleStream } from "@/hooks/useBattleStream";
import { ResponseCard } from "@/components/ResponseCard";
import type { AiJudgeScores } from "@/components/ResponseCard";
import { VoteButtons, VoteChoice } from "@/components/VoteButtons";
import { PromptInput } from "@/components/PromptInput";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";

type VoteResult = {
  revealed_left?: { arm?: string; model_id?: string };
  revealed_right?: { arm?: string; model_id?: string };
  ai_scores?: {
    model_a?: AiJudgeScores;
    model_b?: AiJudgeScores;
  };
};

interface VoteState {
  choice: VoteChoice | null;
  isSubmitting: boolean;
  isRevealed: boolean;
  error: string | null;
  result: VoteResult | null;
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function unwrapProxyResponse(json: any): any {
  // Backend helper returns { ok: true, data: ... }
  // Some endpoints also embed { ok: true, ... } inside data.
  const a = json && typeof json === "object" ? json : null;
  const b = a?.data && typeof a.data === "object" ? a.data : a;
  const c = b?.data && typeof b.data === "object" ? b.data : b;
  return c;
}

function armLabel(arm?: string): "Baseline" | "Strategy" | null {
  if (!arm) return null;
  if (arm === "baseline") return "Baseline";
  return "Strategy";
}

export default function BattlePage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [bootstrappedFromQuery, setBootstrappedFromQuery] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  useEffect(() => {
     const supabase = createSupabaseBrowserClient();
     supabase.auth.getUser().then(({ data }) => {
       if (data.user?.email) setUserEmail(data.user.email);
     });
  }, []);

  const {
    status,
    meta,
    leftText,
    rightText,
    leftDone,
    rightDone,
    error,
    startBattle,
    reset,
  } = useBattleStream();

  const [prompt, setPrompt] = useState<string>("");
  const [voteState, setVoteState] = useState<VoteState>({
    choice: null,
    isSubmitting: false,
    isRevealed: false,
    error: null,
    result: null,
  });

  const handleSubmitPrompt = useCallback(
    (inputPrompt: string) => {
      setPrompt(inputPrompt);
      setVoteState({
        choice: null,
        isSubmitting: false,
        isRevealed: false,
        error: null,
        result: null,
      });
      startBattle(inputPrompt);
    },
    [startBattle]
  );

  useEffect(() => {
    if (bootstrappedFromQuery) return;
    setBootstrappedFromQuery(true);

    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const initialPrompt = url.searchParams.get("prompt");
    if (!initialPrompt) return;

    handleSubmitPrompt(initialPrompt);
    // Clean up URL after bootstrapping.
    router.replace("/battle");
  }, [bootstrappedFromQuery, handleSubmitPrompt, router]);

  const handleVote = useCallback(
    async (choice: VoteChoice) => {
      if (!meta?.session_id) {
        setVoteState((prev) => ({ ...prev, error: "缺少 session_id" }));
        return;
      }
      if (!prompt.trim()) {
        setVoteState((prev) => ({ ...prev, error: "缺少 prompt" }));
        return;
      }

      setVoteState((prev) => ({
        ...prev,
        choice,
        isSubmitting: true,
        error: null,
      }));

      try {
        let user: any = undefined;
        try {
          const supabase = createSupabaseBrowserClient();
          const { data, error: authErr } = await supabase.auth.getSession();
          if (authErr) {
            // best-effort: vote should still work without user
            console.warn("supabase.auth.getSession() failed", authErr);
          }
          user = data.session?.user;
        } catch (err) {
          // best-effort: vote should still work without user
          console.warn("createSupabaseBrowserClient() failed", err);
        }

        const clientInfo = {
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          language: typeof navigator !== "undefined" ? navigator.language : undefined,
          time_zone:
            typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
        };

        const res = await fetch("/api/proxy/api/arena/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: meta.session_id,
            vote: choice,
            prompt,
            left_model: meta.left_model,
            right_model: meta.right_model,
            user_id: user?.id,
            user_email: user?.email,
            client_info: clientInfo,
          }),
        });

        const rawText = await res.text();
        if (!res.ok) {
          throw new Error(`投票失败：${rawText}`);
        }

        const json = safeJsonParse(rawText);
        const payload = unwrapProxyResponse(json);

        setVoteState((prev) => ({
          ...prev,
          isSubmitting: false,
          isRevealed: true,
          result: payload || null,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setVoteState((prev) => ({
          ...prev,
          isSubmitting: false,
          error: message,
        }));
      }
    },
    [meta, prompt]
  );

  const handleReset = useCallback(() => {
    reset();
    setPrompt("");
    setVoteState({
      choice: null,
      isSubmitting: false,
      isRevealed: false,
      error: null,
      result: null,
    });
  }, [reset]);

  const isStreaming = status === "streaming";
  const isDone = status === "done";
  const hasContent = !!(leftText || rightText);
  const canVote = isDone && !voteState.choice && !voteState.isSubmitting;

  const leftStreaming = isStreaming && !leftDone;
  const rightStreaming = isStreaming && !rightDone;

  const revealLeft = voteState.result?.revealed_left;
  const revealRight = voteState.result?.revealed_right;

  const revealedLeftLabel = armLabel(revealLeft?.arm);
  const revealedRightLabel = armLabel(revealRight?.arm);

  const strategySubtitle = useMemo(() => {
    const parts: string[] = [];
    if (meta?.strategy_name) parts.push(String(meta.strategy_name));
    if (meta?.template_id) parts.push(`template=${String(meta.template_id)}`);
    if (meta?.template_emotion) parts.push(`emotion=${String(meta.template_emotion)}`);
    if (meta?.template_intensity) parts.push(`intensity=${String(meta.template_intensity)}`);
    return parts.join(" · ") || undefined;
  }, [meta]);

  const judgeScoresLeft: AiJudgeScores | null = useMemo(() => {
    const scores = voteState.result?.ai_scores;
    if (!scores) return null;
    // ai_scores keys are baseline/strategy (model_a/model_b). Map by reveal arm.
    if (revealLeft?.arm === "baseline") return scores.model_a || null;
    if (revealLeft?.arm) return scores.model_b || null;
    return null;
  }, [voteState.result, revealLeft?.arm]);

  const judgeScoresRight: AiJudgeScores | null = useMemo(() => {
    const scores = voteState.result?.ai_scores;
    if (!scores) return null;
    if (revealRight?.arm === "baseline") return scores.model_a || null;
    if (revealRight?.arm) return scores.model_b || null;
    return null;
  }, [voteState.result, revealRight?.arm]);

  // Determine winner based on vote
  const getWinnerStatus = (side: "left" | "right"): boolean | undefined => {
    if (!voteState.isRevealed) return undefined;
    if (voteState.choice === "tie" || voteState.choice === "both_bad") {
      return undefined;
    }
    return voteState.choice === side;
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

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[var(--main-bg)]/80 backdrop-blur-md">
          <div className="flex items-center gap-2">
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
              className={cn(
                "flex items-center gap-1 rounded-lg px-3 py-2",
                "text-lg font-semibold text-[var(--text-primary)]",
                "hover:bg-white/10 transition-colors"
              )}
            >
              Model Arena
              <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {hasContent && (
              <button
                type="button"
                onClick={handleReset}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5",
                  "text-sm text-[var(--text-muted)] transition-colors",
                  "hover:bg-white/5 hover:text-[var(--text-primary)]"
                )}
              >
                <RotateCcw className="h-4 w-4" />
                <span className="hidden sm:inline">新对局</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-40">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
            <AnimatePresence>
              {status === "idle" && !hasContent && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex flex-col items-center justify-center py-20 text-center"
                >
                  <div className="mb-6 rounded-full bg-white/5 p-4">
                    <Swords className="h-8 w-8 text-[var(--text-primary)]" />
                  </div>
                  <h2 className="mb-2 text-2xl font-semibold text-[var(--text-primary)]">
                    Model Arena
                  </h2>
                  <p className="max-w-md text-[var(--text-muted)]">
                    在底部输入框发送 Prompt，同时对比两路模型的效果。
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {(error || voteState.error) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              >
                {voteState.error || error}
              </motion.div>
            )}

            {prompt && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      Prompt
                    </p>
                    {meta?.session_id ? (
                      <p className="text-xs text-[var(--text-muted)]">
                        session: <span className="font-mono">{meta.session_id}</span>
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[var(--text-primary)]">{prompt}</p>
                </div>
              </motion.div>
            )}

            {hasContent && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "grid gap-4",
                  "grid-cols-1 md:grid-cols-2",
                  "min-h-[320px] md:min-h-[420px]"
                )}
              >
                <div className="h-[320px] md:h-[420px]">
                  <ResponseCard
                    side="left"
                    anonymousLabel="匿名 A"
                    revealed={
                      voteState.isRevealed
                        ? {
                            label: revealedLeftLabel || "已揭晓",
                            subtitle:
                              revealedLeftLabel === "Strategy" ? strategySubtitle : undefined,
                          }
                        : undefined
                    }
                    content={leftText}
                    isStreaming={leftStreaming}
                    isRevealed={voteState.isRevealed}
                    isWinner={getWinnerStatus("left")}
                    judgeScores={judgeScoresLeft}
                    judgeLoading={voteState.isSubmitting}
                  />
                </div>

                <div className="h-[320px] md:h-[420px]">
                  <ResponseCard
                    side="right"
                    anonymousLabel="匿名 B"
                    revealed={
                      voteState.isRevealed
                        ? {
                            label: revealedRightLabel || "已揭晓",
                            subtitle:
                              revealedRightLabel === "Strategy" ? strategySubtitle : undefined,
                          }
                        : undefined
                    }
                    content={rightText}
                    isStreaming={rightStreaming}
                    isRevealed={voteState.isRevealed}
                    isWinner={getWinnerStatus("right")}
                    judgeScores={judgeScoresRight}
                    judgeLoading={voteState.isSubmitting}
                  />
                </div>
              </motion.div>
            )}

            <AnimatePresence>
              {isDone && hasContent && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-8"
                >
                  <div className="text-center">
                    {!voteState.isRevealed && (
                      <p className="mb-4 text-sm text-[var(--text-muted)]">你觉得哪一个更好？</p>
                    )}

                    <VoteButtons
                      onVote={handleVote}
                      disabled={!canVote || voteState.isSubmitting}
                      votedChoice={voteState.choice}
                    />

                    {voteState.isRevealed && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-6"
                      >
                        <p className="text-sm text-[var(--text-muted)]">投票成功，身份已揭晓。</p>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        <PromptInput
          onSubmit={handleSubmitPrompt}
          disabled={isStreaming}
          placeholder={isStreaming ? "生成中…" : "Message Model Arena"}
          containerClassName={cn(
             "md:left-[260px] border-t-0 bg-gradient-to-t from-[var(--main-bg)] to-transparent", 
             "backdrop-blur-none pb-8 pt-10"
          )}
        />
      </div>
    </div>
  );
}
