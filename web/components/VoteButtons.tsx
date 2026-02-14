"use client";

import { motion } from "framer-motion";
import { cn } from "./ui";
import { useI18n } from "@/utils/i18n-context";

export type VoteChoice = "left" | "right" | "tie" | "both_bad";

interface VoteButtonsProps {
  onVote: (choice: VoteChoice) => void;
  disabled?: boolean;
  votedChoice?: VoteChoice | null;
}

const voteOptionsDef: {
  value: VoteChoice;
  labelKey: string;
  icon?: string;
  colorClass: string;
}[] = [
  {
    value: "left",
    labelKey: "vote.a_better",
    icon: "\ud83d\udc48",
    colorClass: "hover:bg-interactive-accent hover:border-interactive-accent hover:text-white"
  },
  {
    value: "right",
    labelKey: "vote.b_better",
    icon: "\ud83d\udc49",
    colorClass: "hover:bg-interactive-accent hover:border-interactive-accent hover:text-white"
  },
  {
    value: "tie",
    labelKey: "vote.tie",
    icon: "\ud83e\udd1d",
    colorClass: "hover:bg-surface-elevated hover:border-text-secondary hover:text-text-primary"
  },
  {
    value: "both_bad",
    labelKey: "vote.both_bad",
    icon: "\ud83d\udc4e",
    colorClass: "hover:bg-negative hover:border-negative hover:text-white"
  },
];

export function VoteButtons({ onVote, disabled, votedChoice }: VoteButtonsProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {voteOptionsDef.map((opt) => {
        const isSelected = votedChoice === opt.value;
        const isLocked = votedChoice !== null && votedChoice !== undefined;
        const isDisabled = !!disabled || isLocked;
        const label = t(opt.labelKey);

        return (
          <motion.button
            key={opt.value}
            type="button"
            onClick={() => onVote(opt.value)}
            disabled={isDisabled}
            whileHover={!isDisabled ? { scale: 1.02 } : {}}
            whileTap={!isDisabled ? { scale: 0.98 } : {}}
            aria-label={`Vote ${label}`}
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
            <span>{label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
