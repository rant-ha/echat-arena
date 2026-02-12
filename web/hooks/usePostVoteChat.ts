"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export interface PostVoteTurn {
  turn_index: number;
  user_message: string;
  assistant_message: string;
  created_at: string;
}

interface UsePostVoteChatOptions {
  sessionId: string | null;
  initialVoteId?: string | null;
  localStorageKey?: string;
}

interface UsePostVoteChatReturn {
  voteId: string | null;
  winnerSide: "left" | "right" | null;
  turns: PostVoteTurn[];
  currentReply: string;
  isChatting: boolean;
  pendingMessage: string | null;
  historyLoaded: boolean;
  historyError: string | null;
  sendError: string | null;
  isVoted: boolean;
  preVoteConversation: {
    prompt: string;
    reply_a: string;
    reply_b: string;
    conversation_history: any[];
    model_config: any;
  } | null;
  sendMessage: (message: string) => Promise<void>;
  setVoteContext: (voteId: string, winnerSide: "left" | "right") => void;
  clearVoteState: () => void;
  retryHistory: () => void;
}

function dedupTurns(turns: PostVoteTurn[]): PostVoteTurn[] {
  const map = new Map<number, PostVoteTurn>();
  for (const t of turns) map.set(t.turn_index, t);
  return [...map.values()].sort((a, b) => a.turn_index - b.turn_index);
}

const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function usePostVoteChat({
  sessionId,
  initialVoteId,
  localStorageKey,
}: UsePostVoteChatOptions): UsePostVoteChatReturn {
  const [voteId, setVoteId] = useState<string | null>(null);
  const [winnerSide, setWinnerSide] = useState<"left" | "right" | null>(null);
  const [turns, setTurns] = useState<PostVoteTurn[]>([]);
  const [currentReply, setCurrentReply] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isVoted, setIsVoted] = useState(false);
  const [preVoteConversation, setPreVoteConversation] = useState<UsePostVoteChatReturn["preVoteConversation"]>(null);
  const [storedSessionId, setStoredSessionId] = useState<string | null>(null);

  // Prop takes priority, localStorage fallback
  const resolvedSessionId = sessionId || storedSessionId;

  // Prevent duplicate fetches
  const fetchingRef = useRef(false);

  // 1. Restore from localStorage on mount
  useEffect(() => {
    if (!localStorageKey) return;
    try {
      const saved = localStorage.getItem(localStorageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      const { session_id, vote_id, winnerSide: savedWinner, timestamp } = parsed;
      if (!session_id || !savedWinner || !timestamp) {
        localStorage.removeItem(localStorageKey);
        return;
      }
      if (Date.now() - timestamp > EXPIRY_MS) {
        localStorage.removeItem(localStorageKey);
        return;
      }
      if (vote_id) setVoteId(vote_id);
      setWinnerSide(savedWinner);
      setIsVoted(true);
      setStoredSessionId(session_id);
    } catch {
      localStorage.removeItem(localStorageKey);
    }
  }, [localStorageKey]);

  // 2. Set initialVoteId on mount (for /chat/[id] page)
  useEffect(() => {
    if (initialVoteId && !localStorageKey) {
      setVoteId(initialVoteId);
    }
  }, [initialVoteId, localStorageKey]);

  // 3. Auto-fetch history when voteId is available
  useEffect(() => {
    if (!resolvedSessionId || !voteId || historyLoaded || fetchingRef.current || isChatting) return;

    fetchingRef.current = true;

    const fetchHistory = async () => {
      try {
        const params = new URLSearchParams({ session_id: resolvedSessionId });
        params.set("vote_id", voteId);
        const res = await fetch(`/api/proxy/api/arena/chat/history?${params.toString()}`);
        if (!res.ok) {
          setHistoryError("http_error");
          return;
        }

        const json = await res.json();
        const data = json?.data || json;

        // Check for backend error_type
        if (data.error_type) {
          setHistoryError(data.error_type);
          // Don't set historyLoaded — allow retry
          return;
        }

        if (data.turns && Array.isArray(data.turns)) {
          setTurns(prev => dedupTurns([...prev, ...data.turns]));
        }

        // Extract winner info
        const ws = data.winner_side || data.winner;
        if (ws === "left" || ws === "right") {
          setWinnerSide(ws);
        }
        if (data.vote_id) {
          setVoteId(data.vote_id);
        }
        if (data.turns?.length > 0 || ws) {
          setIsVoted(true);
        }

        // Extract pre-vote conversation
        if (data.conversation) {
          const conv = data.conversation;
          setPreVoteConversation({
            prompt: conv.prompt || "",
            reply_a: conv.reply_a || "",
            reply_b: conv.reply_b || "",
            conversation_history: conv.conversation_history || [],
            model_config: conv.model_config || null,
          });
        }

        setHistoryError(null);
        setHistoryLoaded(true);
      } catch (err) {
        console.warn("Failed to fetch post-vote chat history:", err);
        setHistoryError("fetch_exception");
      } finally {
        fetchingRef.current = false;
      }
    };

    fetchHistory();
  }, [resolvedSessionId, voteId, historyLoaded, isChatting]);

  // 4. sendMessage — SSE stream with saved validation
  const sendMessage = useCallback(async (message: string) => {
    if (!resolvedSessionId || isChatting) return;

    setIsChatting(true);
    setPendingMessage(message);
    setCurrentReply("");
    setSendError(null);

    try {
      const res = await fetch("/api/proxy/api/arena/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: resolvedSessionId,
          vote_id: voteId || undefined,
          user_message: message,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let reply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (raw === "[DONE]") continue;

          try {
            const json = JSON.parse(raw);
            const frameType = json.type || (json.delta ? "delta" : json.finish ? "finish" : "unknown");

            switch (frameType) {
              case "meta":
                break;

              case "delta":
                if (json.delta) {
                  reply += json.delta;
                  setCurrentReply(reply);
                }
                break;

              case "finish": {
                if (json.saved === true) {
                  // Server confirmed persistence — safe to add turn
                  const newTurn: PostVoteTurn = {
                    turn_index: json.turn_index ?? 0,
                    user_message: message,
                    assistant_message: reply,
                    created_at: new Date().toISOString(),
                  };
                  setTurns(prev => dedupTurns([...prev, newTurn]));
                  setPendingMessage(null);
                  setCurrentReply("");

                  // Post-send reconciliation: re-fetch history after 1s
                  setTimeout(() => setHistoryLoaded(false), 1000);
                } else {
                  // Server did NOT persist — don't add phantom turn
                  setSendError("save_failed");
                  // Keep pendingMessage visible so user knows what they sent
                }
                break;
              }

              case "error":
                if (json.error) {
                  setSendError(json.error);
                }
                break;

              default:
                // Fallback: handle legacy frames
                if (json.delta) {
                  reply += json.delta;
                  setCurrentReply(reply);
                }
                if (json.finish) {
                  if (json.saved === true) {
                    const newTurn: PostVoteTurn = {
                      turn_index: json.turn_index ?? 0,
                      user_message: message,
                      assistant_message: reply,
                      created_at: new Date().toISOString(),
                    };
                    setTurns(prev => dedupTurns([...prev, newTurn]));
                    setPendingMessage(null);
                    setCurrentReply("");
                    setTimeout(() => setHistoryLoaded(false), 1000);
                  } else {
                    setSendError("save_failed");
                  }
                }
                break;
            }
          } catch {
            // Ignore JSON parse errors for individual SSE lines
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Detect session expiry
      if (msg.includes("Invalid session") || msg.includes("Must vote")) {
        if (localStorageKey) localStorage.removeItem(localStorageKey);
        setSendError("session_expired");
      } else {
        setSendError(msg);
      }
    } finally {
      setIsChatting(false);
    }
  }, [resolvedSessionId, voteId, isChatting, localStorageKey]);

  // 5. setVoteContext — called by parent after voting
  const setVoteContext = useCallback((newVoteId: string, newWinnerSide: "left" | "right") => {
    setVoteId(newVoteId);
    setWinnerSide(newWinnerSide);
    setIsVoted(true);
    setHistoryLoaded(false);
    setHistoryError(null);

    if (localStorageKey && resolvedSessionId) {
      try {
        localStorage.setItem(localStorageKey, JSON.stringify({
          session_id: resolvedSessionId,
          vote_id: newVoteId,
          winnerSide: newWinnerSide,
          timestamp: Date.now(),
        }));
      } catch {
        // localStorage unavailable
      }
    }
  }, [localStorageKey, resolvedSessionId]);

  // 6. clearVoteState
  const clearVoteState = useCallback(() => {
    setVoteId(null);
    setWinnerSide(null);
    setTurns([]);
    setCurrentReply("");
    setIsChatting(false);
    setPendingMessage(null);
    setHistoryLoaded(false);
    setHistoryError(null);
    setSendError(null);
    setIsVoted(false);
    setPreVoteConversation(null);
    setStoredSessionId(null);

    if (localStorageKey) {
      try {
        localStorage.removeItem(localStorageKey);
      } catch {}
    }
  }, [localStorageKey]);

  // 7. retryHistory — allow manual retry of history fetch
  const retryHistory = useCallback(() => {
    setHistoryLoaded(false);
    setHistoryError(null);
    fetchingRef.current = false;
  }, []);

  return {
    voteId,
    winnerSide,
    turns,
    currentReply,
    isChatting,
    pendingMessage,
    historyLoaded,
    historyError,
    sendError,
    isVoted,
    preVoteConversation,
    sendMessage,
    setVoteContext,
    clearVoteState,
    retryHistory,
  };
}
