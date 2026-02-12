"use client";

import { useCallback, useState, KeyboardEvent, useMemo, useRef, useEffect } from "react";
import { Send, Plus, Search, Image, FileCode, Film, Globe } from "lucide-react";
import { cn } from "./ui";

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Optional extra classes applied to the container wrapper. */
  containerClassName?: string;
  /** Variant: "default" for battle page, "home" for ChatGPT-style home page */
  variant?: "default" | "home";
  /** Whether web search is enabled */
  searchEnabled?: boolean;
  /** Callback to toggle web search */
  onSearchToggle?: () => void;
}

export function PromptInput({
  onSubmit,
  disabled,
  placeholder = "Message Model Arena...",
  containerClassName,
  variant = "default",
  searchEnabled,
  onSearchToggle,
}: PromptInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = useMemo(() => {
    return !disabled && value.trim().length > 0;
  }, [disabled, value]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
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

  // Auto-resize textarea
  useEffect(() => {
    const target = textareaRef.current;
    if (target) {
      target.style.height = "auto";
      target.style.height = Math.min(target.scrollHeight, 200) + "px";
    }
  }, [value]);

  return (
    <div
      className={cn(
        "relative w-full max-w-4xl mx-auto",
        containerClassName
      )}
    >
      <div className="relative flex flex-col w-full bg-surface-tertiary rounded-[26px] border border-border-faint shadow-lg focus-within:ring-1 focus-within:ring-border-strong focus-within:border-border-strong transition-all duration-200">
        
        {/* Input Area */}
        <div className="flex w-full items-end gap-2 p-3 pl-4">
          {/* Visual-only Attachment Button */}
          <button
            type="button"
            className="mb-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
            title="Attachments (Visual Only)"
          >
            <Plus className="h-5 w-5" />
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent py-3",
              "text-base text-text-primary placeholder:text-text-muted/70",
              "focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "min-h-[44px] max-h-[200px]"
            )}
            style={{
              height: "44px", // Initial height matches min-height
            }}
          />

          {/* Send Button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            className={cn(
              "mb-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200",
              canSend
                ? "bg-interactive-accent text-white hover:bg-interactive-hover"
                : "bg-surface-elevated text-text-muted cursor-not-allowed opacity-50"
            )}
            aria-label="Send prompt"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {/* Bottom Toolbar (Visual Only for Aesthetics) */}
        <div className="flex items-center justify-between px-4 pb-2.5">
          <div className="flex items-center gap-1">
             {onSearchToggle && (
               <button
                 type="button"
                 onClick={onSearchToggle}
                 className={cn(
                   "p-1.5 rounded-lg transition-colors",
                   searchEnabled
                     ? "bg-interactive-accent/20 text-interactive-accent"
                     : "text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                 )}
                 title={searchEnabled ? "Search enabled (click to disable)" : "Enable web search"}
               >
                 <Globe className="h-4 w-4" />
               </button>
             )}
             <button type="button" className="p-1.5 rounded-lg text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors" title="Image">
                <Image className="h-4 w-4" />
             </button>
             <button type="button" className="p-1.5 rounded-lg text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors" title="Code">
                <FileCode className="h-4 w-4" />
             </button>
          </div>
          <div className="text-[10px] text-text-muted select-none">
            Enter to send, Shift + Enter for new line
          </div>
        </div>
      </div>
      
      <div className="mt-2 text-center text-xs text-text-muted">
        Inputs are processed by third-party AI and responses may be inaccurate.
      </div>
    </div>
  );
}
