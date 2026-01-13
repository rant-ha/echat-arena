"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, RotateCcw } from "lucide-react";
import { useBattleStream } from "@/hooks/useBattleStream";
import { ResponseCard } from "@/components/ResponseCard";
import { VoteButtons, VoteChoice } from "@/components/VoteButtons";
import { PromptInput } from "@/components/PromptInput";
import { cn } from "@/components/ui";

interface VoteState {
  choice: VoteChoice | null;
  isSubmitting: boolean;
  isRevealed: boolean;
  error: string | null;
}

export default function BattlePage() {
  const {
    status,
    meta,
    leftText,
    rightText,
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
  });

  const handleSubmitPrompt = useCallback(
    (inputPrompt: string) => {
      setPrompt(inputPrompt);
      setVoteState({
        choice: null,
        isSubmitting: false,
        isRevealed: false,
        error: null,
      });
      startBattle(inputPrompt);
    },
    [startBattle]
  );

  const handleVote = useCallback(
    async (choice: VoteChoice) => {
      if (!meta?.session_id) {
        setVoteState((prev) => ({
          ...prev,
          error: "No session ID available",
        }));
        return;
      }

      setVoteState((prev) => ({
        ...prev,
        choice,
        isSubmitting: true,
        error: null,
      }));

      try {
        const res = await fetch("/api/proxy/arena/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: meta.session_id,
            vote: choice,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Vote failed: ${text}`);
        }

        // Reveal cards after successful vote
        setVoteState((prev) => ({
          ...prev,
          isSubmitting: false,
          isRevealed: true,
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
    [meta]
  );

  const handleReset = useCallback(() => {
    reset();
    setPrompt("");
    setVoteState({
      choice: null,
      isSubmitting: false,
      isRevealed: false,
      error: null,
    });
  }, [reset]);

  const isStreaming = status === "streaming";
  const isDone = status === "done";
  const hasContent = leftText || rightText;
  const canVote = isDone && !voteState.choice && !voteState.isSubmitting;

  // Determine winner based on vote
  const getWinnerStatus = (side: "left" | "right"): boolean | undefined => {
    if (!voteState.isRevealed) return undefined;
    if (voteState.choice === "tie" || voteState.choice === "both_bad") {
      return undefined;
    }
    return voteState.choice === side;
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-card/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Swords className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">
              Empathy Arena
            </h1>
          </div>
          {hasContent && (
            <button
              onClick={handleReset}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-1.5",
                "text-sm text-muted transition-colors",
                "hover:bg-white/5 hover:text-foreground"
              )}
            >
              <RotateCcw className="h-4 w-4" />
              New Battle
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-40">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          {/* Empty state */}
          <AnimatePresence>
            {status === "idle" && !hasContent && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="mb-6 rounded-full bg-primary/10 p-6">
                  <Swords className="h-12 w-12 text-primary" />
                </div>
                <h2 className="mb-2 text-2xl font-semibold text-foreground">
                  Welcome to Empathy Arena
                </h2>
                <p className="max-w-md text-muted">
                  Enter a prompt below to see two AI responses side by side.
                  Compare them and vote for the better one!
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error state */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              {error}
            </motion.div>
          )}

          {/* User prompt display */}
          {prompt && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                  Your Prompt
                </p>
                <p className="text-foreground">{prompt}</p>
              </div>
            </motion.div>
          )}

          {/* Response cards - Responsive grid */}
          {hasContent && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "grid gap-4",
                // Mobile: stacked (column), Desktop: side by side (row)
                "grid-cols-1 md:grid-cols-2",
                "min-h-[300px] md:min-h-[400px]"
              )}
            >
              {/* Left card (Anonymous A) */}
              <div className="h-[300px] md:h-[400px]">
                <ResponseCard
                  side="left"
                  anonymousLabel="Anonymous A"
                  revealedLabel={meta?.left_label}
                  content={leftText}
                  isStreaming={isStreaming}
                  isRevealed={voteState.isRevealed}
                  isWinner={getWinnerStatus("left")}
                />
              </div>

              {/* Right card (Anonymous B) */}
              <div className="h-[300px] md:h-[400px]">
                <ResponseCard
                  side="right"
                  anonymousLabel="Anonymous B"
                  revealedLabel={meta?.right_label}
                  content={rightText}
                  isStreaming={isStreaming}
                  isRevealed={voteState.isRevealed}
                  isWinner={getWinnerStatus("right")}
                />
              </div>
            </motion.div>
          )}

          {/* Vote section */}
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
                    <p className="mb-4 text-sm text-muted">
                      Which response is better?
                    </p>
                  )}
                  <VoteButtons
                    onVote={handleVote}
                    disabled={!canVote || voteState.isSubmitting}
                    votedChoice={voteState.choice}
                  />
                  {voteState.error && (
                    <p className="mt-3 text-sm text-red-300">
                      {voteState.error}
                    </p>
                  )}
                  {voteState.isRevealed && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-6"
                    >
                      <p className="text-sm text-muted">
                        Thanks for voting! Click &quot;New Battle&quot; to try another
                        prompt.
                      </p>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Fixed bottom input */}
      <PromptInput
        onSubmit={handleSubmitPrompt}
        disabled={isStreaming}
        placeholder={
          isStreaming
            ? "Waiting for responses..."
            : "Enter your prompt to compare two AI responses..."
        }
      />
    </div>
  );
}
