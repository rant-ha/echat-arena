"use client";

import { motion } from "framer-motion";
import { cn } from "./ui";

export type VoteChoice = "left" | "right" | "tie" | "both_bad";

interface VoteButtonsProps {
  onVote: (choice: VoteChoice) => void;
  disabled?: boolean;
  votedChoice?: VoteChoice | null;
}

const voteOptions: {
  value: VoteChoice;
  label: string;
  icon?: string;
  colorClass: string;
}[] = [
  { 
    value: "left", 
    label: "A is better", 
    icon: "👈",
    colorClass: "hover:bg-interactive-accent hover:border-interactive-accent hover:text-white" 
  },
  { 
    value: "right", 
    label: "B is better", 
    icon: "👉",
    colorClass: "hover:bg-interactive-accent hover:border-interactive-accent hover:text-white" 
  },
  { 
    value: "tie", 
    label: "Tie", 
    icon: "🤝",
    colorClass: "hover:bg-surface-elevated hover:border-text-secondary hover:text-text-primary" 
  },
  { 
    value: "both_bad", 
    label: "Both bad", 
    icon: "👎",
    colorClass: "hover:bg-negative hover:border-negative hover:text-white" 
  },
];

export function VoteButtons({ onVote, disabled, votedChoice }: VoteButtonsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {voteOptions.map((opt) => {
        const isSelected = votedChoice === opt.value;
        const isLocked = votedChoice !== null && votedChoice !== undefined;
        const isDisabled = !!disabled || isLocked;

        return (
          <motion.button
            key={opt.value}
            type="button"
            onClick={() => onVote(opt.value)}
            disabled={isDisabled}
            whileHover={!isDisabled ? { scale: 1.02 } : {}}
            whileTap={!isDisabled ? { scale: 0.98 } : {}}
            className={cn(
              "group flex items-center justify-center gap-2 rounded-full px-6 py-2.5",
              "relative border border-glass-border bg-glass-bg glass-surface vote-glow",
              "text-sm font-medium text-text-secondary transition-all duration-200",
              "shadow-sm",
              !isDisabled && opt.colorClass,
              isDisabled && "cursor-not-allowed opacity-50",
              isLocked && !isSelected && "opacity-30 grayscale",
              isSelected &&
                "border-interactive-accent bg-interactive-accent text-white ring-2 ring-interactive-accent/30"
            )}
          >
            {opt.icon && <span className="text-base">{opt.icon}</span>}
            <span>{opt.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
