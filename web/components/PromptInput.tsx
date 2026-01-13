"use client";

import { useState, useCallback, KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { cn } from "./ui";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function PromptInput({
  onSubmit,
  disabled,
  placeholder = "Enter your prompt to compare two AI responses...",
}: PromptInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  }, [value, disabled, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "border-t border-border/50 bg-card/80 backdrop-blur-xl",
        "px-4 py-4 sm:px-6"
      )}
    >
      <div className="mx-auto flex max-w-4xl items-end gap-3">
        <div className="flex-1">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "w-full resize-none rounded-xl border border-border/60",
              "bg-background/50 px-4 py-3 text-sm leading-relaxed",
              "placeholder:text-muted",
              "focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "min-h-[48px] max-h-[200px]"
            )}
            style={{
              height: "auto",
              minHeight: "48px",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 200) + "px";
            }}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl",
            "border border-primary/40 bg-primary/10 text-primary",
            "transition-all duration-200",
            "hover:bg-primary/20 hover:border-primary/60",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-primary/10"
          )}
        >
          {disabled ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>
      <p className="mx-auto mt-2 max-w-4xl text-center text-xs text-muted">
        Press <kbd className="rounded bg-border/30 px-1.5 py-0.5">Enter</kbd> to
        send, <kbd className="rounded bg-border/30 px-1.5 py-0.5">Shift+Enter</kbd>{" "}
        for new line
      </p>
    </div>
  );
}
