"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { cn } from "./ui";

export type ResponseCardReveal = {
  label?: string;
  subtitle?: string;
};

export type AiJudgeScores = {
  empathy_score?: number;
  emotional_safety_score?: number;
  helpfulness_score?: number;
  comment?: string;
};

function totalAiScore(s: AiJudgeScores | null | undefined): number | null {
  if (!s) return null;
  const a = typeof s.empathy_score === "number" ? s.empathy_score : null;
  const b =
    typeof s.emotional_safety_score === "number" ? s.emotional_safety_score : null;
  const c = typeof s.helpfulness_score === "number" ? s.helpfulness_score : null;
  if (a === null || b === null || c === null) return null;
  return a + b + c;
}

interface ResponseCardProps {
  side: "left" | "right";
  anonymousLabel: string;
  revealed?: ResponseCardReveal;
  content: string;
  isStreaming: boolean;
  isRevealed: boolean;
  isWinner?: boolean;
  judgeScores?: AiJudgeScores | null;
  judgeLoading?: boolean;
}

export function ResponseCard({
  anonymousLabel,
  revealed,
  content,
  isStreaming,
  isRevealed,
  isWinner,
  judgeScores,
  judgeLoading,
}: ResponseCardProps) {
  const total = totalAiScore(judgeScores);

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
                Streaming…
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="prose prose-sm prose-invert max-w-none leading-relaxed text-foreground/80 prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
              <ReactMarkdown>{content}</ReactMarkdown>
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
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-foreground/90">
                {revealed?.label || anonymousLabel}
              </h3>
              {revealed?.subtitle ? (
                <p className="mt-1 truncate text-xs text-muted">
                  {revealed.subtitle}
                </p>
              ) : null}
            </div>
            {isWinner === true && (
              <span className="shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                Winner
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="prose prose-sm prose-invert max-w-none leading-relaxed text-foreground/80 prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          </div>

          {/* AI Judge scores hidden per user request - data still collected in backend */}
        </div>
      </motion.div>
    </div>
  );
}
