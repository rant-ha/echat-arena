"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Check, RefreshCw, AlertCircle } from "lucide-react";
import { cn } from "@/components/ui";

interface Model {
  model_key: string;
  model_name: string;
  description: string | null;
  is_default: boolean;
}

interface ModelSelectorProps {
  selectedModelKey: string | null;
  onModelChange: (modelKey: string) => void;
  onDefaultLoaded?: (defaultKey: string | null) => void;
  disabled?: boolean;
}

type LoadingState = "loading" | "success" | "error";

export function ModelSelector({
  selectedModelKey,
  onModelChange,
  onDefaultLoaded,
  disabled = false,
}: ModelSelectorProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [defaultModelKey, setDefaultModelKey] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch models from API
  const fetchModels = useCallback(async () => {
    setLoadingState("loading");
    setError(null);

    try {
      const res = await fetch("/api/proxy/api/arena/models");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      const data = json.data || json;

      if (data.models && Array.isArray(data.models)) {
        setModels(data.models);
        setDefaultModelKey(data.default_model_key || null);
        setLoadingState("success");

        // Notify parent of default
        if (onDefaultLoaded) {
          onDefaultLoaded(data.default_model_key || null);
        }
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load models";
      setError(message);
      setLoadingState("error");
    }
  }, [onDefaultLoaded]);

  // Initial fetch
  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (disabled) return;

      switch (event.key) {
        case "Enter":
        case " ":
          event.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setFocusedIndex(models.findIndex((m) => m.model_key === selectedModelKey));
          } else if (focusedIndex >= 0 && focusedIndex < models.length) {
            onModelChange(models[focusedIndex].model_key);
            setIsOpen(false);
            setFocusedIndex(-1);
          }
          break;

        case "Escape":
          event.preventDefault();
          setIsOpen(false);
          setFocusedIndex(-1);
          buttonRef.current?.focus();
          break;

        case "ArrowDown":
          event.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setFocusedIndex(0);
          } else {
            setFocusedIndex((prev) => (prev < models.length - 1 ? prev + 1 : prev));
          }
          break;

        case "ArrowUp":
          event.preventDefault();
          if (isOpen) {
            setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          }
          break;

        case "Tab":
          setIsOpen(false);
          setFocusedIndex(-1);
          break;
      }
    },
    [disabled, isOpen, focusedIndex, models, selectedModelKey, onModelChange]
  );

  // Scroll focused item into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-model-item]");
      items[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [isOpen, focusedIndex]);

  // Get selected model display name
  const selectedModel = models.find((m) => m.model_key === selectedModelKey);
  const displayName = selectedModel?.model_name || defaultModelKey || "Select Model";

  // Loading state
  if (loadingState === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-lg py-1.5 px-2 text-sm text-text-muted">
        <div className="h-4 w-20 animate-pulse rounded bg-surface-elevated" />
        <ChevronDown className="h-3.5 w-3.5" />
      </div>
    );
  }

  // Error state
  if (loadingState === "error") {
    return (
      <button
        type="button"
        onClick={fetchModels}
        className="flex items-center gap-2 rounded-lg py-1.5 px-2 text-sm text-negative hover:bg-negative/10 transition-colors"
        title={error || "Failed to load models"}
      >
        <AlertCircle className="h-4 w-4" />
        <span className="hidden sm:inline">Retry</span>
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    );
  }

  // Empty state
  if (models.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg py-1.5 px-2 text-sm text-text-muted">
        <span>No models</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          "flex items-center gap-2 rounded-lg py-1.5 px-2 text-sm font-semibold transition-colors",
          disabled
            ? "text-text-muted cursor-not-allowed"
            : "text-text-primary hover:bg-surface-elevated"
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="max-w-[120px] truncate sm:max-w-[200px]">{displayName}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-text-muted transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Menu */}
          <div
            ref={listRef}
            role="listbox"
            className="absolute left-0 top-full z-50 mt-1 w-64 max-h-80 overflow-y-auto rounded-xl border border-border-faint bg-surface-secondary shadow-lg"
            onKeyDown={handleKeyDown}
          >
            <div className="p-1">
              {models.map((model, index) => {
                const isSelected = model.model_key === selectedModelKey;
                const isFocused = index === focusedIndex;

                return (
                  <button
                    key={model.model_key}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-model-item
                    onClick={() => {
                      onModelChange(model.model_key);
                      setIsOpen(false);
                      setFocusedIndex(-1);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      isFocused && "bg-surface-elevated",
                      !isFocused && "hover:bg-surface-elevated"
                    )}
                  >
                    {/* Checkmark */}
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {isSelected && (
                        <Check className="h-4 w-4 text-interactive-accent" />
                      )}
                    </div>

                    {/* Model info */}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-text-primary">
                        {model.model_name}
                      </div>
                      {model.description && (
                        <div className="mt-0.5 text-xs text-text-muted line-clamp-2">
                          {model.description}
                        </div>
                      )}
                    </div>

                    {/* Default badge */}
                    {model.is_default && (
                      <span className="shrink-0 rounded bg-interactive-accent/10 px-1.5 py-0.5 text-xs text-interactive-accent">
                        Default
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
