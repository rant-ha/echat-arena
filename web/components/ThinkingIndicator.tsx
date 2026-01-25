"use client";

import { cn } from "./ui";

interface ThinkingIndicatorProps {
  text?: string;
  showSkeleton?: boolean;
  className?: string;
}

export function ThinkingIndicator({
  text = "思考中...",
  showSkeleton = true,
  className
}: ThinkingIndicatorProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <span className="h-2 w-2 rounded-full bg-interactive-accent animate-bounce [animation-delay:-0.3s]" />
          <span className="h-2 w-2 rounded-full bg-interactive-accent animate-bounce [animation-delay:-0.15s]" />
          <span className="h-2 w-2 rounded-full bg-interactive-accent animate-bounce" />
        </div>
        <span className="text-sm text-text-muted">{text}</span>
      </div>

      {showSkeleton && (
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-surface-elevated overflow-hidden">
            <div className="h-full w-full animate-shimmer bg-gradient-to-r from-surface-elevated via-surface-tertiary to-surface-elevated bg-[length:200%_100%]" />
          </div>
          <div className="h-4 w-4/5 rounded bg-surface-elevated overflow-hidden">
            <div className="h-full w-full animate-shimmer bg-gradient-to-r from-surface-elevated via-surface-tertiary to-surface-elevated bg-[length:200%_100%]" />
          </div>
        </div>
      )}
    </div>
  );
}
