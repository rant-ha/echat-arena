"use client";

import { motion } from "framer-motion";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { useState } from "react";
import { cn } from "./ui";
import { Copy, Check } from "lucide-react";

export type ResponseCardReveal = {
  label?: string;
  subtitle?: string;
  modelId?: string;
};

export type AiJudgeScores = {
  empathy_score?: number;
  emotional_safety_score?: number;
  helpfulness_score?: number;
  comment?: string;
};

interface AIResponseCardProps {
  side: "left" | "right";
  anonymousLabel: string;
  revealed?: ResponseCardReveal;
  content: string;
  isStreaming: boolean;
  isRevealed: boolean;
  isWinner?: boolean;
  isLoser?: boolean;
  judgeScores?: AiJudgeScores | null;
  judgeLoading?: boolean;
}

export function AIResponseCard({
  side,
  anonymousLabel,
  revealed,
  content,
  isStreaming,
  isRevealed,
  isWinner,
  isLoser = false,
  judgeScores,
  judgeLoading,
}: AIResponseCardProps) {
  const [copied, setCopied] = useState(false);

  const hasContent = content.trim().length > 0;

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Render AI response content
  const renderContent = () => {
    // Thinking state: streaming but no content yet
    if (isStreaming && !hasContent) {
      return (
        <div className="flex flex-col gap-3 p-4">
          {/* Thinking indicator */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-interactive-accent animate-bounce [animation-delay:-0.3s]" />
              <span className="h-2 w-2 rounded-full bg-interactive-accent animate-bounce [animation-delay:-0.15s]" />
              <span className="h-2 w-2 rounded-full bg-interactive-accent animate-bounce" />
            </div>
            <span className="text-sm text-text-muted">思考中...</span>
          </div>
          {/* Shimmer skeleton lines */}
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-surface-elevated overflow-hidden">
              <div className="h-full w-full animate-shimmer bg-gradient-to-r from-surface-elevated via-surface-tertiary to-surface-elevated bg-[length:200%_100%]" />
            </div>
            <div className="h-4 w-4/5 rounded bg-surface-elevated overflow-hidden">
              <div className="h-full w-full animate-shimmer bg-gradient-to-r from-surface-elevated via-surface-tertiary to-surface-elevated bg-[length:200%_100%]" />
            </div>
            <div className="h-4 w-3/5 rounded bg-surface-elevated overflow-hidden">
              <div className="h-full w-full animate-shimmer bg-gradient-to-r from-surface-elevated via-surface-tertiary to-surface-elevated bg-[length:200%_100%]" />
            </div>
          </div>
        </div>
      );
    }

    // Idle state: waiting for user to start
    if (!hasContent) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-text-muted">等待回复...</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-0 px-1 h-full">
        {/* AI Response */}
        {hasContent && (
          <div className="flex justify-start w-full">
            <div className="w-full">
              <div className="prose prose-sm prose-invert max-w-none break-words leading-relaxed text-text-secondary prose-pre:bg-surface-primary prose-pre:border prose-pre:border-border-faint prose-code:bg-surface-elevated prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                <MarkdownRenderer>{content}</MarkdownRenderer>
                {isStreaming && (
                  <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-interactive-accent align-middle" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "perspective-1000 h-full w-full transition-all duration-300",
        isLoser ? "grayscale opacity-60" : ""
      )}
    >
      <motion.div
        className="relative h-full w-full"
        initial={false}
        animate={{ rotateY: isRevealed ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Front Face — glow wrapper (no overflow-hidden, so ::after pseudo-elements render fully) */}
        <div
          className={cn(
            "absolute inset-0 rounded-xl",
            isStreaming && !hasContent && "streaming-glow",
            isStreaming && hasContent && "streaming-subtle",
            isWinner === true && "winner-glow"
          )}
          style={{ backfaceVisibility: "hidden" }}
        >
          <div
            className={cn(
              "flex h-full w-full flex-col overflow-hidden",
              "rounded-xl border border-glass-border bg-glass-bg",
              "shadow-card transition-colors duration-300",
              isWinner === true && "border-positive ring-1 ring-positive/30"
            )}
          >
          {/* Header */}
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-border-faint/50 bg-transparent px-4">
            <div className="flex items-center gap-2.5">
              {/* Model Icon */}
              <div className={cn(
                "h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white",
                side === "left"
                  ? "bg-gradient-to-br from-blue-500 to-blue-600"
                  : "bg-gradient-to-br from-purple-500 to-purple-600"
              )}>
                {side === "left" ? "A" : "B"}
              </div>
              {/* Model Name */}
              <span className="font-mono text-sm font-medium text-text-primary">
                {anonymousLabel}
              </span>
            </div>

            <div className="flex items-center gap-0.5">
              <button
                onClick={handleCopy}
                className="rounded-md p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
                title="Copy response"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-positive" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div
            className="flex-1 overflow-y-auto touch-pan-y overscroll-contain p-4 relative bg-transparent"
            style={{ transform: 'translateZ(0)', WebkitOverflowScrolling: 'touch' }}
          >
            {renderContent()}
          </div>
          </div>
        </div>

        {/* Back Face (Revealed) — glow wrapper */}
        <div
          className={cn(
            "absolute inset-0 rounded-xl",
            isWinner === true && "winner-glow"
          )}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div
            className={cn(
              "flex h-full w-full flex-col overflow-hidden",
              "rounded-xl border border-glass-border bg-glass-bg",
              "shadow-card",
              isWinner === true && "border-positive ring-1 ring-positive/30"
            )}
          >
          {/* Revealed Header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-faint/50 bg-transparent px-4">
            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-text-primary">
                  {revealed?.label || (side === "left" ? "Model A" : "Model B")}
                </span>
                {isWinner === true && (
                  <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400 uppercase tracking-wider">
                    Winner
                  </span>
                )}
              </div>
              {revealed?.subtitle && (
                <span className="truncate text-[10px] text-text-muted">
                  {revealed.subtitle}
                </span>
              )}
            </div>

            <div className="flex items-center gap-0.5">
              <button
                onClick={handleCopy}
                className="rounded-md p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-positive" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div
            className="flex-1 overflow-y-auto touch-pan-y overscroll-contain p-4 bg-transparent"
            style={{ transform: 'translateZ(0)', WebkitOverflowScrolling: 'touch' }}
          >
            {renderContent()}
          </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
