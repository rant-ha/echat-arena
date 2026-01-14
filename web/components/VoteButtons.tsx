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
  help: string;
}[] = [
  { value: "left", label: "A 更好", help: "我更喜欢 A" },
  { value: "right", label: "B 更好", help: "我更喜欢 B" },
  { value: "tie", label: "平局", help: "差不多" },
  { value: "both_bad", label: "都差", help: "都不太行" },
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
            whileHover={!isDisabled ? { scale: 1.03 } : {}}
            whileTap={!isDisabled ? { scale: 0.97 } : {}}
            className={cn(
              "group flex items-center gap-2 rounded-xl px-5 py-2.5",
              "border border-border bg-card/60 backdrop-blur",
              "text-sm font-medium transition-all duration-200",
              "shadow-soft",
              !isDisabled &&
                "hover:border-primary/40 hover:bg-card/80 hover:text-primary",
              isDisabled && "cursor-not-allowed opacity-60",
              isLocked && !isSelected && "opacity-35",
              isSelected &&
                "border-primary/60 bg-primary/10 text-primary ring-2 ring-primary/30"
            )}
          >
            <span>{opt.label}</span>
            <span className="hidden text-xs text-muted group-hover:inline">
              {opt.help}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
