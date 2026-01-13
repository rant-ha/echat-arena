"use client";

import { motion } from "framer-motion";
import { cn } from "./ui";

interface ResponseCardProps {
  side: "left" | "right";
  anonymousLabel: string; // "Anonymous A" or "Anonymous B"
  revealedLabel?: string; // "Baseline" or "Strategy: warmth"
  content: string;
  isStreaming: boolean;
  isRevealed: boolean;
  isWinner?: boolean;
  aiScore?: number | null;
  aiScoreLoading?: boolean;
}

export function ResponseCard({
  side,
  anonymousLabel,
  revealedLabel,
  content,
  isStreaming,
  isRevealed,
  isWinner,
  aiScore,
  aiScoreLoading,
}: ResponseCardProps) {
  return (
    <div className="perspective-1000 h-full w-full">
      <motion.div
        className="relative h-full w-full"
        initial={false}
        animate={{ rotateY: isRevealed ? 180 : 0 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Front face (anonymous) */}
        <div
          className={cn(
            "absolute inset-0 rounded-2xl border p-5",
            "bg-card/80 backdrop-blur-xl shadow-soft",
            "flex flex-col",
            isWinner === true && "border-green-400/50 ring-2 ring-green-400/30",
            isWinner === false && "border-border",
            isWinner === undefined && "border-border"
          )}
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground/90">
              {anonymousLabel}
            </h3>
            {isStreaming && (
              <span className="flex items-center gap-1.5 text-xs text-primary">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Streaming...
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
              {content}
              {isStreaming && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary" />
              )}
            </div>
          </div>
        </div>

        {/* Back face (revealed) */}
        <div
          className={cn(
            "absolute inset-0 rounded-2xl border p-5",
            "bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-xl shadow-soft",
            "flex flex-col",
            isWinner === true && "border-green-400/50 ring-2 ring-green-400/30",
            isWinner === false && "border-border",
            isWinner === undefined && "border-border"
          )}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground/90">
              {revealedLabel || anonymousLabel}
            </h3>
            {isWinner === true && (
              <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                Winner
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
              {content}
            </div>
          </div>

          {/* AI Score section */}
          <div className="mt-3 border-t border-border/50 pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">AI Judge Score</span>
              {aiScoreLoading ? (
                <span className="flex items-center gap-1 text-muted">
                  <span className="h-3 w-3 animate-spin rounded-full border border-primary/50 border-t-primary" />
                  Loading...
                </span>
              ) : aiScore !== null && aiScore !== undefined ? (
                <span className="font-mono text-primary">{aiScore}/10</span>
              ) : (
                <span className="text-muted">—</span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
