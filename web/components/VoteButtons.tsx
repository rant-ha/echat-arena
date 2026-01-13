"use client";

import { motion } from "framer-motion";
import { cn } from "./ui";

export type VoteChoice = "left" | "right" | "tie" | "both_bad";

interface VoteButtonsProps {
  onVote: (choice: VoteChoice) => void;
  disabled?: boolean;
  votedChoice?: VoteChoice | null;
}

const voteOptions: { value: VoteChoice; label: string; emoji: string }[] = [
  { value: "left", label: "Vote A", emoji: "👈" },
  { value: "right", label: "Vote B", emoji: "👉" },
  { value: "tie", label: "Tie", emoji: "🤝" },
  { value: "both_bad", label: "Both Bad", emoji: "👎" },
];

export function VoteButtons({
  onVote,
  disabled,
  votedChoice,
}: VoteButtonsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {voteOptions.map((opt) => {
        const isSelected = votedChoice === opt.value;
        return (
          <motion.button
            key={opt.value}
            onClick={() => onVote(opt.value)}
            disabled={disabled || votedChoice !== undefined}
            whileHover={!disabled && !votedChoice ? { scale: 1.05 } : {}}
            whileTap={!disabled && !votedChoice ? { scale: 0.95 } : {}}
            className={cn(
              "flex items-center gap-2 rounded-xl px-5 py-2.5",
              "border border-border bg-card/60 backdrop-blur",
              "text-sm font-medium transition-all duration-200",
              "shadow-soft",
              !disabled &&
                !votedChoice &&
                "hover:border-primary/40 hover:bg-card/80 hover:text-primary",
              disabled && "cursor-not-allowed opacity-50",
              votedChoice && !isSelected && "opacity-40",
              isSelected &&
                "border-primary/60 bg-primary/10 text-primary ring-2 ring-primary/30"
            )}
          >
            <span className="text-lg">{opt.emoji}</span>
            <span>{opt.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
