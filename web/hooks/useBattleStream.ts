"use client";

import { useCallback, useRef, useState } from "react";

export type BattleStreamSide = "meta" | "left" | "right" | "error";

export interface BattleMeta {
  session_id: string;
  left_model: string;
  right_model: string;
  template_id?: string | null;
  strategy_name?: string | null;
  template_emotion?: string;
  template_intensity?: string;
  emotion?: string;
  intensity?: string;
  support_type?: string;
  classifier_comment?: string;
  ts?: string;
}

export interface BattleStreamFrame {
  side: BattleStreamSide;
  delta?: string;
  finish?: boolean;
  error?: string;

  // meta frame fields
  session_id?: string;
  left_model?: string;
  right_model?: string;
  template_id?: string | null;
  strategy_name?: string | null;
  template_emotion?: string;
  template_intensity?: string;
  emotion?: string;
  intensity?: string;
  support_type?: string;
  classifier_comment?: string;
  ts?: string;
}

export interface BattleState {
  status: "idle" | "streaming" | "done" | "error";
  meta: BattleMeta | null;
  leftText: string;
  rightText: string;
  leftDone: boolean;
  rightDone: boolean;
  error: string | null;
}

const initialState: BattleState = {
  status: "idle",
  meta: null,
  leftText: "",
  rightText: "",
  leftDone: false,
  rightDone: false,
  error: null,
};

function parseSseEventBlock(block: string): string[] {
  const lines = block.split(/\r?\n/);
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith(":")) continue; // comment/keepalive
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  if (dataLines.length === 0) return [];
  // SSE spec: multiple data: lines concatenate with "\n"
  return [dataLines.join("\n")];
}

function coerceMeta(frame: BattleStreamFrame): BattleMeta | null {
  const session_id = typeof frame.session_id === "string" ? frame.session_id : "";
  const left_model = typeof frame.left_model === "string" ? frame.left_model : "";
  const right_model = typeof frame.right_model === "string" ? frame.right_model : "";
  if (!session_id || !left_model || !right_model) return null;

  return {
    session_id,
    left_model,
    right_model,
    template_id: frame.template_id ?? null,
    strategy_name: frame.strategy_name ?? null,
    template_emotion: frame.template_emotion,
    template_intensity: frame.template_intensity,
    emotion: frame.emotion,
    intensity: frame.intensity,
    support_type: frame.support_type,
    classifier_comment: frame.classifier_comment,
    ts: frame.ts,
  };
}

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

  const startBattle = useCallback(async (prompt: string) => {
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      status: "streaming",
      meta: null,
      leftText: "",
      rightText: "",
      leftDone: false,
      rightDone: false,
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
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      const handleFrame = (frame: BattleStreamFrame) => {
        setState((prev) => {
          if (frame.side === "error") {
            return {
              ...prev,
              status: "error",
              error: frame.error || "Unknown error",
            };
          }

          if (frame.side === "meta") {
            const meta = coerceMeta(frame);
            return meta ? { ...prev, meta } : prev;
          }

          if (frame.side === "left") {
            const leftText = frame.delta ? prev.leftText + frame.delta : prev.leftText;
            const leftDone = prev.leftDone || !!frame.finish;
            const status = leftDone && prev.rightDone ? "done" : prev.status;
            return { ...prev, leftText, leftDone, status };
          }

          if (frame.side === "right") {
            const rightText = frame.delta ? prev.rightText + frame.delta : prev.rightText;
            const rightDone = prev.rightDone || !!frame.finish;
            const status = prev.leftDone && rightDone ? "done" : prev.status;
            return { ...prev, rightText, rightDone, status };
          }

          return prev;
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, "\n");

        let idx = buffer.indexOf("\n\n");
        while (idx !== -1) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          for (const data of parseSseEventBlock(block)) {
            if (!data) continue;
            if (data === "[DONE]") {
              setState((prev) => ({
                ...prev,
                status: prev.status === "error" ? "error" : "done",
              }));
              continue;
            }
            try {
              const frame = JSON.parse(data) as BattleStreamFrame;
              if (frame && typeof frame === "object" && typeof frame.side === "string") {
                handleFrame(frame);
              }
            } catch {
              // ignore malformed frames
            }
          }

          idx = buffer.indexOf("\n\n");
        }
      }

      // If stream ends without explicit finish frames, mark done best-effort.
      setState((prev) => ({
        ...prev,
        status: prev.status === "error" ? "error" : "done",
      }));
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        status: "error",
        error: message,
      }));
    }
  }, []);

  return {
    ...state,
    startBattle,
    reset,
    abort,
  };
}
