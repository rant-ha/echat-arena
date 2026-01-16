"use client";

import { useCallback, useState, KeyboardEvent, useMemo } from "react";
import { Send, Plus } from "lucide-react";
import { cn } from "./ui";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Optional extra classes applied to the container wrapper. */
  containerClassName?: string;
  /** Variant: "default" for battle page, "home" for ChatGPT-style home page */
  variant?: "default" | "home";
}

export function PromptInput({
  onSubmit,
  disabled,
  placeholder = "输入你的 Prompt，比较两路回答…",
  containerClassName,
  variant = "default",
}: PromptInputProps) {
  const [value, setValue] = useState("");

  const canSend = useMemo(() => {
    return !disabled && value.trim().length > 0;
  }, [disabled, value]);

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

  // Home variant - ChatGPT style centered input
  if (variant === "home") {
    return (
      <div
        className={cn(
          "relative w-full",
          containerClassName
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2",
            "rounded-3xl",
            "bg-[var(--input-bg)]",
            "px-4 py-3",
            "border border-transparent",
            "focus-within:border-[var(--border-color)]"
          )}
        >
          {/* Plus icon on the left */}
          <button
            type="button"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full",
              "text-[var(--text-muted)]",
              "hover:bg-white/10 transition-colors"
            )}
          >
            <Plus className="h-5 w-5" />
          </button>

          {/* Input field */}
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent",
              "text-base text-[var(--text-primary)]",
              "placeholder:text-[var(--text-muted)]",
              "focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "min-h-[28px] max-h-[200px]"
            )}
            style={{
              height: "auto",
              minHeight: "28px",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 200) + "px";
            }}
          />

          {/* Send button on the right */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full",
              "transition-all duration-200",
              canSend
                ? "bg-white text-black hover:bg-gray-200"
                : "bg-[var(--text-muted)]/30 text-[var(--text-muted)] cursor-not-allowed"
            )}
            aria-label="Send prompt"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // Default variant - original battle page style
  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "border-t border-[var(--border-color)] bg-[var(--main-bg)]/90 backdrop-blur-xl",
        "px-4 py-4 sm:px-6",
        containerClassName
      )}
    >
      <div className="mx-auto max-w-4xl">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className={cn(
                "w-full resize-none rounded-xl border border-[var(--border-color)]",
                "bg-[var(--input-bg)] px-4 py-3 text-sm leading-relaxed",
                "text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                "focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10",
                "disabled:cursor-not-allowed disabled:opacity-60",
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
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl",
              "transition-all duration-200",
              canSend
                ? "bg-white text-black hover:bg-gray-200"
                : "bg-[var(--input-bg)] text-[var(--text-muted)] cursor-not-allowed"
            )}
            aria-label="Send prompt"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-center text-xs text-[var(--text-muted)]">
          回车发送，Shift+Enter 换行
        </p>
      </div>
    </div>
  );
}
