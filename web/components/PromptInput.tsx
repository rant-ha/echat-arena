"use client";

import { useCallback, useState, KeyboardEvent, useMemo, useRef, useEffect } from "react";
import { Send, Plus, Globe, SlidersHorizontal } from "lucide-react";
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);

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

  // Close tools popover on click outside
  useEffect(() => {
    if (!toolsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [toolsOpen]);

  return (
    <div
      className={cn(
        "relative w-full max-w-4xl mx-auto",
        containerClassName
      )}
    >
      <div className="relative flex flex-col w-full bg-glass-bg rounded-[26px] border border-glass-border shadow-lg glass-surface focus-within:ring-1 focus-within:ring-interactive-accent/40 focus-within:border-interactive-accent/50 transition-all duration-200">
        
        {/* Input Area */}
        <div className="flex w-full items-end gap-2 p-3 px-4">
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

        {/* Bottom Toolbar */}
        <div className="flex items-center px-4 pb-2.5">
          <div className="flex items-center gap-1">
            {/* Attachment "+" Button (placeholder) */}
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
              title="Attachments (coming soon)"
            >
              <Plus className="h-5 w-5" />
            </button>

            {/* Tools Button + Popover */}
            {onSearchToggle && (
              <div ref={toolsRef} className="relative">
                {/* Popover — appears above */}
                {toolsOpen && (
                  <div className="absolute bottom-full mb-2 left-0 w-56 rounded-xl border border-glass-border bg-glass-bg glass-surface shadow-lg p-2 z-50">
                    {/* Search Toggle Row */}
                    <button
                      type="button"
                      onClick={onSearchToggle}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 hover:bg-surface-elevated transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Globe className="h-4 w-4 text-text-muted" />
                        <span className="text-sm text-text-primary">Search</span>
                      </div>
                      {/* iOS-style Toggle Switch */}
                      <div className={cn(
                        "relative h-5 w-9 rounded-full transition-colors",
                        searchEnabled ? "bg-interactive-accent" : "bg-surface-elevated"
                      )}>
                        <div className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                          searchEnabled ? "translate-x-4" : "translate-x-0.5"
                        )} />
                      </div>
                    </button>
                  </div>
                )}

                {/* Tools Trigger Button */}
                <button
                  type="button"
                  onClick={() => setToolsOpen(prev => !prev)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    searchEnabled
                      ? "text-interactive-accent"
                      : "text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                  )}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>Tools</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="mt-2 text-center text-xs text-text-muted">
        Inputs are processed by third-party AI and responses may be inaccurate.
      </div>
    </div>
  );
}
