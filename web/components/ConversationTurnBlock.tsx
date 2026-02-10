"use client";

import { cn } from "./ui";
import { UserMessageBubble } from "./UserMessageBubble";
import { AIResponseCard, ResponseCardReveal, AiJudgeScores } from "./AIResponseCard";

interface ConversationTurnBlockProps {
  turnIndex: number;
  userMessage: string;

  // Model A (left)
  leftContent: string;
  leftAnonymousLabel: string;
  leftRevealed?: ResponseCardReveal;
  leftIsStreaming: boolean;
  leftIsWinner?: boolean;
  leftJudgeScores?: AiJudgeScores | null;

  // Model B (right)
  rightContent: string;
  rightAnonymousLabel: string;
  rightRevealed?: ResponseCardReveal;
  rightIsStreaming: boolean;
  rightIsWinner?: boolean;
  rightJudgeScores?: AiJudgeScores | null;

  // Shared state
  isRevealed: boolean;
  judgeLoading?: boolean;

  // Winner side for styling loser
  winnerSide?: "left" | "right" | null;

  className?: string;
}

export function ConversationTurnBlock({
  turnIndex,
  userMessage,
  leftContent,
  leftAnonymousLabel,
  leftRevealed,
  leftIsStreaming,
  leftIsWinner,
  leftJudgeScores,
  rightContent,
  rightAnonymousLabel,
  rightRevealed,
  rightIsStreaming,
  rightIsWinner,
  rightJudgeScores,
  isRevealed,
  judgeLoading,
  winnerSide,
  className,
}: ConversationTurnBlockProps) {
  return (
    <div className={cn("mb-8", className)}>
      {/* User Message - Full Width, Right Aligned */}
      <UserMessageBubble message={userMessage} className="mb-4" />

      {/* AI Responses - Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[400px]">
        <div className="h-full min-h-[400px]">
          <AIResponseCard
            side="left"
            anonymousLabel={leftAnonymousLabel}
            revealed={leftRevealed}
            content={leftContent}
            isStreaming={leftIsStreaming}
            isRevealed={isRevealed}
            isWinner={leftIsWinner}
            isLoser={isRevealed && winnerSide === "right"}
            judgeScores={leftJudgeScores}
            judgeLoading={judgeLoading}
          />
        </div>

        <div className="h-full min-h-[400px]">
          <AIResponseCard
            side="right"
            anonymousLabel={rightAnonymousLabel}
            revealed={rightRevealed}
            content={rightContent}
            isStreaming={rightIsStreaming}
            isRevealed={isRevealed}
            isWinner={rightIsWinner}
            isLoser={isRevealed && winnerSide === "left"}
            judgeScores={rightJudgeScores}
            judgeLoading={judgeLoading}
          />
        </div>
      </div>
    </div>
  );
}
