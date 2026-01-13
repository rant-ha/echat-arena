"use client";

import { useCallback, useRef, useState } from "react";

// SSE event data types
export interface BattleMeta {
  session_id: string;
  left_label: string; // e.g. "Baseline"
  right_label: string; // e.g. "Strategy: warmth"
  left_model?: string;
  right_model?: string;
}

export interface StreamChunk {
  side: "meta" | "left" | "right";
  content?: string;
  meta?: BattleMeta;
}

export interface BattleState {
  status: "idle" | "streaming" | "done" | "error";
  meta: BattleMeta | null;
  leftText: string;
  rightText: string;
  error: string | null;
}

const initialState: BattleState = {
  status: "idle",
  meta: null,
  leftText: "",
  rightText: "",
  error: null,
};

/**
 * useBattleStream - Hook for handling SSE streaming from /api/proxy/arena/battle
 *
 * Parses SSE events with format:
 *   data: {"side": "meta", "meta": {...}}
 *   data: {"side": "left", "content": "Hello"}
 *   data: {"side": "right", "content": "Hi"}
 *   data: [DONE]
 */
export function useBattleStream() {
  const [state, setState] = useState<BattleState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState(initialState);
  }, []);

  const startBattle = useCallback(async (prompt: string) => {
    // Abort any existing stream
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      status: "streaming",
      meta: null,
      leftText: "",
      rightText: "",
      error: null,
    });

    try {
      const res = await fetch("/api/proxy/arena/battle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        throw new Error("Expected SSE stream, got: " + contentType);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split("\n");
        // Keep incomplete line in buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) {
            // Empty line or comment
            continue;
          }

          if (trimmed.startsWith("data:")) {
            const data = trimmed.slice(5).trim();

            if (data === "[DONE]") {
              setState((prev) => ({ ...prev, status: "done" }));
              continue;
            }

            try {
              const chunk: StreamChunk = JSON.parse(data);
              handleChunk(chunk);
            } catch {
              // Might be partial JSON, try to accumulate
              // For now, log and skip
              console.warn("Failed to parse SSE data:", data);
            }
          }
        }
      }

      // Final flush
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data:")) {
          const data = trimmed.slice(5).trim();
          if (data !== "[DONE]") {
            try {
              const chunk: StreamChunk = JSON.parse(data);
              handleChunk(chunk);
            } catch {
              console.warn("Failed to parse final SSE data:", data);
            }
          }
        }
      }

      setState((prev) => ({
        ...prev,
        status: prev.status === "error" ? "error" : "done",
      }));
    } catch (err) {
      if (controller.signal.aborted) {
        // Intentional abort, not an error
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        status: "error",
        error: message,
      }));
    }
  }, []);

  function handleChunk(chunk: StreamChunk) {
    setState((prev) => {
      switch (chunk.side) {
        case "meta":
          return {
            ...prev,
            meta: chunk.meta || null,
          };
        case "left":
          return {
            ...prev,
            leftText: prev.leftText + (chunk.content || ""),
          };
        case "right":
          return {
            ...prev,
            rightText: prev.rightText + (chunk.content || ""),
          };
        default:
          return prev;
      }
    });
  }

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      status: prev.status === "streaming" ? "done" : prev.status,
    }));
  }, []);

  return {
    ...state,
    startBattle,
    reset,
    abort,
  };
}
