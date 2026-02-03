"use client";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { cn } from "./ui";

interface UserMessageBubbleProps {
  message: string;
  className?: string;
}

export function UserMessageBubble({ message, className }: UserMessageBubbleProps) {
  return (
    <div className={cn("flex justify-end w-full", className)}>
      <div className="max-w-[80%] md:max-w-[60%] rounded-2xl bg-surface-elevated px-4 py-3 shadow-sm">
        <div className="prose prose-sm prose-invert max-w-none break-words leading-relaxed text-text-primary">
          <MarkdownRenderer>{message}</MarkdownRenderer>
        </div>
      </div>
    </div>
  );
}
