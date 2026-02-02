"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Swords, RotateCcw, Menu, X } from "lucide-react";
import { useBattleStream } from "@/hooks/useBattleStream";
import { ConversationTurnBlock } from "@/components/ConversationTurnBlock";
import type { AiJudgeScores } from "@/components/AIResponseCard";
import { VoteButtons, VoteChoice } from "@/components/VoteButtons";
import { useRef } from "react";
import { PromptInput } from "@/components/PromptInput";
import { Sidebar } from "@/components/Sidebar";
import { ModelSelector } from "@/components/ModelSelector";
import { cn } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";

type VoteResult = {
  revealed_left?: { arm?: string; model_id?: string };
  revealed_right?: { arm?: string; model_id?: string };
  ai_scores?: {
    model_a?: AiJudgeScores;
    model_b?: AiJudgeScores;
  };
  winner?: 'left' | 'right' | null;
};

interface VoteState {
  choice: VoteChoice | null;
  isSubmitting: boolean;
  isRevealed: boolean;
  error: string | null;
  result: VoteResult | null;
}

// 投票后对话的轮次类型
interface PostVoteTurn {
  turn_index: number;
  user_message: string;
  assistant_message: string;
  created_at: string;
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function unwrapProxyResponse(json: any): any {
  const a = json && typeof json === "object" ? json : null;
  const b = a?.data && typeof a.data === "object" ? a.data : a;
  const c = b?.data && typeof b.data === "object" ? b.data : b;
  return c;
}

function armLabel(arm?: string): "Baseline" | "Strategy" | null {
  if (!arm) return null;
  if (arm === "baseline") return "Baseline";
  return "Strategy";
}

export default function BattlePage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [bootstrappedFromQuery, setBootstrappedFromQuery] = useState(false);

  // 投票后对话状态
  const [winnerSide, setWinnerSide] = useState<'left' | 'right' | null>(null);
  const [postVoteTurns, setPostVoteTurns] = useState<PostVoteTurn[]>([]);
  const [postVoteCurrentReply, setPostVoteCurrentReply] = useState("");
  const [isPostVoteChatting, setIsPostVoteChatting] = useState(false);
  const [restoredSessionId, setRestoredSessionId] = useState<string | null>(null);

  // M-06: Memoize callbacks to prevent unnecessary re-renders
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const toggleSidebarCollapse = useCallback(() => setSidebarCollapsed(prev => !prev), []);

  useEffect(() => {
     const supabase = createSupabaseBrowserClient();
     supabase.auth.getUser().then(({ data }) => {
       if (data.user?.email) setUserEmail(data.user.email);
     });
  }, []);

  // 恢复投票后状态
  useEffect(() => {
    const saved = localStorage.getItem('postVoteState');
    if (!saved) return;

    try {
      const { session_id, winnerSide: savedWinner, timestamp } = JSON.parse(saved);

      // 检查是否过期（30天）
      if (Date.now() - timestamp > 30 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem('postVoteState');
        return;
      }

      // 恢复状态
      setRestoredSessionId(session_id);
      setWinnerSide(savedWinner);
      setVoteState(prev => ({
        ...prev,
        isRevealed: true,
      }));
    } catch (e) {
      localStorage.removeItem('postVoteState');
    }
  }, []);

  // Multi-turn conversation state
  const [conversationHistory, setConversationHistory] = useState<Array<{
    turn: number;
    user: string;
    reply_a: string;
    reply_b: string;
  }>>([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [turnWarning, setTurnWarning] = useState(false);

  // Model selector state
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [defaultModelKey, setDefaultModelKey] = useState<string | null>(null);
  const MODEL_STORAGE_KEY = "echat-arena-v1-selected-model";

  // Load model selection from URL or localStorage
  useEffect(() => {
    // 优先使用 URL 参数
    const urlParams = new URLSearchParams(window.location.search);
    const urlModel = urlParams.get("model");

    if (urlModel) {
      setSelectedModelKey(urlModel);
      try {
        localStorage.setItem(MODEL_STORAGE_KEY, urlModel);
      } catch {}
      return;
    }

    // 回退到 localStorage
    try {
      const stored = localStorage.getItem(MODEL_STORAGE_KEY);
      if (stored) {
        setSelectedModelKey(stored);
      }
    } catch {
      // localStorage might be unavailable
    }
  }, []);

  // Handle model change
  const handleModelChange = useCallback((modelKey: string) => {
    setSelectedModelKey(modelKey);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, modelKey);
    } catch {
      // localStorage might be unavailable in private mode
    }
  }, []);

  // Handle default model loaded from API
  const handleDefaultModelLoaded = useCallback((defaultKey: string | null) => {
    setDefaultModelKey(defaultKey);
    // If no selection yet, use default
    if (!selectedModelKey && defaultKey) {
      setSelectedModelKey(defaultKey);
    }
  }, [selectedModelKey]);

  // M-06: Memoize callbacks to prevent unnecessary re-renders
  const handleWarning = useCallback((message: string) => {
    setTurnWarning(true);
  }, []);

  const handleTurnUpdate = useCallback((turn: number) => {
    setCurrentTurn(turn);
  }, []);

  const {
    status,
    meta,
    leftText,
    rightText,
    leftDone,
    rightDone,
    error,
    startBattle,
    continueConversation,
    reset,
  } = useBattleStream({ onWarning: handleWarning, onTurnUpdate: handleTurnUpdate });

  const [prompt, setPrompt] = useState<string>("");
  const [voteState, setVoteState] = useState<VoteState>({
    choice: null,
    isSubmitting: false,
    isRevealed: false,
    error: null,
    result: null,
  });

  // 投票后发送消息
  const postVoteChatSend = useCallback(async (message: string) => {
    const sessionId = meta?.session_id || restoredSessionId;
    if (!sessionId) {
      setVoteState((prev) => ({ ...prev, error: "缺少 session_id" }));
      return;
    }

    setIsPostVoteChatting(true);
    setPostVoteCurrentReply("");

    try {
      const res = await fetch("/api/proxy/api/arena/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          user_message: message,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`投票后对话失败：${text}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentReply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;

          try {
            const json = JSON.parse(data);
            
            // Phase 8.2: Unified SSE frame schema parsing
            const frameType = json.type || (json.delta ? "delta" : json.finish ? "finish" : json.error ? "error" : "unknown");
            
            switch (frameType) {
              case "meta":
                break;
              
              case "delta":
                if (json.delta) {
                  currentReply += json.delta;
                  setPostVoteCurrentReply(currentReply);
                }
                break;
              
              case "finish":
                if (json.finish) {
                  const newTurn: PostVoteTurn = {
                    turn_index: postVoteTurns.length + 1,
                    user_message: message,
                    assistant_message: currentReply,
                    created_at: new Date().toISOString(),
                  };
                  setPostVoteTurns((prev) => [...prev, newTurn]);
                  setPostVoteCurrentReply("");
                  setIsPostVoteChatting(false);
                }
                break;
              
              case "error":
                if (json.error) {
                  throw new Error(json.error);
                }
                break;
              
              default:
                if (json.delta) {
                  currentReply += json.delta;
                  setPostVoteCurrentReply(currentReply);
                }
                if (json.finish) {
                  const newTurn: PostVoteTurn = {
                    turn_index: postVoteTurns.length + 1,
                    user_message: message,
                    assistant_message: currentReply,
                    created_at: new Date().toISOString(),
                  };
                  setPostVoteTurns((prev) => [...prev, newTurn]);
                  setPostVoteCurrentReply("");
                  setIsPostVoteChatting(false);
                }
                break;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // 检测 session 过期
      if (message.includes('Invalid session') || message.includes('Must vote')) {
        localStorage.removeItem('postVoteState');
        setVoteState((prev) => ({
          ...prev,
          error: "会话已过期，请开始新对话",
          isRevealed: false,
        }));
        setWinnerSide(null);
      } else {
        setVoteState((prev) => ({ ...prev, error: message }));
      }

      setIsPostVoteChatting(false);
    }
  }, [meta?.session_id, restoredSessionId, postVoteTurns.length]);

  // 刷新恢复投票后聊天历史
  useEffect(() => {
    const sessionId = meta?.session_id || restoredSessionId;
    if (voteState.isRevealed && sessionId && postVoteTurns.length === 0) {
      const fetchHistory = async () => {
        try {
          const res = await fetch(
            `/api/proxy/api/arena/chat/history?session_id=${sessionId}`
          );
          if (!res.ok) return;

          const json = await res.json();
          const data = json?.data || json;
          if (data.turns && Array.isArray(data.turns)) {
            setPostVoteTurns(data.turns);
          }
        } catch (err) {
          console.warn("Failed to fetch post-vote chat history:", err);
        }
      };
      fetchHistory();
    }
  }, [voteState.isRevealed, meta?.session_id, restoredSessionId, postVoteTurns.length]);

  const handleSubmitPrompt = useCallback(
    (inputPrompt: string) => {
      setPrompt(inputPrompt);

      // 投票后继续对话分支
      if (voteState.isRevealed && winnerSide) {
        postVoteChatSend(inputPrompt);
        return;
      }

      // 投票前的正常流程
      if (voteState.isRevealed) {
        return; // 已投票但无 winner，不允许继续
      }

      // Determine model to use: selected > default > undefined (backend fallback)
      const modelToUse = selectedModelKey || defaultModelKey || undefined;

      // Only reset vote state on first turn
      if (currentTurn === 0) {
        localStorage.removeItem('postVoteState');
        setVoteState({
          choice: null,
          isSubmitting: false,
          isRevealed: false,
          error: null,
          result: null,
        });
        startBattle(inputPrompt, modelToUse);
      } else {
        // Continue conversation for subsequent turns (uses session's model)
        if (!meta?.session_id) {
          setVoteState((prev) => ({
            ...prev,
            error: "缺少 session_id，无法继续对话",
          }));
          return;
        }
        continueConversation(meta.session_id, inputPrompt);
      }
    },
    [startBattle, continueConversation, currentTurn, meta?.session_id, voteState.isRevealed, winnerSide, postVoteChatSend, selectedModelKey, defaultModelKey]
  );

  // 保存草稿到数据库
  const saveDraft = useCallback(async () => {
    if (!meta?.session_id || !prompt) return;

    try {
      let user: any = undefined;
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error: authErr } = await supabase.auth.getUser();
        if (authErr) {
          console.warn("supabase.auth.getUser() failed", authErr);
          return; // Don't save if user is not authenticated
        }
        user = data.user;
        if (!user?.id) {
          console.warn("No user id available, skipping draft save");
          return; // Don't save if user id is undefined
        }
      } catch (err) {
        console.warn("createSupabaseBrowserClient() failed", err);
        return; // Don't save on error
      }

      await fetch("/api/proxy/api/arena/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: meta.session_id,
          user_id: user?.id,
          user_email: user?.email,
          prompt,
          reply_a: leftText,
          reply_b: rightText,
          model_a: meta.left_model,
          model_b: meta.right_model,
          conversation_history: conversationHistory,
          turn_count: currentTurn,
          model_config: {
            left: { model_id: meta.left_model },
            right: { model_id: meta.right_model },
          },
        }),
      });
    } catch (err) {
      console.warn("Failed to save draft:", err);
    }
  }, [meta, prompt, leftText, rightText, conversationHistory, currentTurn]);

  // Append to conversation history when a round completes
  useEffect(() => {
    if (status === "done" && prompt && leftText && rightText) {
      const existingTurn = conversationHistory.find(t => t.turn === (currentTurn || 1));
      if (!existingTurn) {
        setConversationHistory(prev => [
          ...prev,
          {
            turn: currentTurn || 1,
            user: prompt,
            reply_a: leftText,
            reply_b: rightText,
          }
        ]);
        // Update current turn if not already set by backend
        if (currentTurn === 0) {
          setCurrentTurn(1);
        }
      }
    }
  }, [status, prompt, leftText, rightText, currentTurn, conversationHistory]);

  // 对话完成后自动保存草稿（投票前）
  useEffect(() => {
    if (status === "done" && meta?.session_id && !voteState.isRevealed) {
      saveDraft();
    }
  }, [status, meta?.session_id, voteState.isRevealed, saveDraft]);

  useEffect(() => {
    if (bootstrappedFromQuery) return;
    setBootstrappedFromQuery(true);

    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const initialPrompt = url.searchParams.get("prompt");
    if (!initialPrompt) return;

    handleSubmitPrompt(initialPrompt);
    // Clean up URL after bootstrapping.
    router.replace("/battle");
  }, [bootstrappedFromQuery, handleSubmitPrompt, router]);

  const handleVote = useCallback(
    async (choice: VoteChoice) => {
      if (!meta?.session_id) {
        setVoteState((prev) => ({ ...prev, error: "缺少 session_id" }));
        return;
      }
      if (!prompt.trim()) {
        setVoteState((prev) => ({ ...prev, error: "缺少 prompt" }));
        return;
      }

      setVoteState((prev) => ({
        ...prev,
        choice,
        isSubmitting: true,
        error: null,
      }));

      try {
        let user: any = undefined;
        try {
          const supabase = createSupabaseBrowserClient();
          const { data, error: authErr } = await supabase.auth.getUser();
          if (authErr) {
            console.warn("supabase.auth.getUser() failed", authErr);
          }
          user = data.user;
        } catch (err) {
          console.warn("createSupabaseBrowserClient() failed", err);
        }

        const clientInfo = {
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          language: typeof navigator !== "undefined" ? navigator.language : undefined,
          time_zone:
            typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
        };

        const res = await fetch("/api/proxy/api/arena/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: meta.session_id,
            vote: choice,
            prompt,
            left_model: meta.left_model,
            right_model: meta.right_model,
            user_id: user?.id,
            user_email: user?.email,
            client_info: clientInfo,
          }),
        });

        const rawText = await res.text();
        if (!res.ok) {
          throw new Error(`投票失败：${rawText}`);
        }

        const json = safeJsonParse(rawText);
        const payload = unwrapProxyResponse(json);

        // 确定胜者侧
        let winner: 'left' | 'right' | null = null;
        if (choice === 'left') winner = 'left';
        else if (choice === 'right') winner = 'right';

        setVoteState((prev) => ({
          ...prev,
          isSubmitting: false,
          isRevealed: true,
          result: payload ? { ...payload, winner } : null,
        }));

        setWinnerSide(winner);

        // 保存投票状态到 localStorage
        if (winner && meta?.session_id) {
          localStorage.setItem('postVoteState', JSON.stringify({
            session_id: meta.session_id,
            winnerSide: winner,
            timestamp: Date.now(),
          }));
        }

        // 删除草稿（已投票）
        if (meta?.session_id) {
          fetch(`/api/proxy/api/arena/draft/${meta.session_id}`, {
            method: "DELETE",
          }).catch(() => {});
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setVoteState((prev) => ({
          ...prev,
          isSubmitting: false,
          error: message,
        }));
      }
    },
    [meta, prompt]
  );

  const handleReset = useCallback(() => {
    localStorage.removeItem('postVoteState');
    reset();
    setPrompt("");
    setVoteState({
      choice: null,
      isSubmitting: false,
      isRevealed: false,
      error: null,
      result: null,
    });
    setConversationHistory([]);
    setCurrentTurn(0);
    setTurnWarning(false);
    setWinnerSide(null);
    setPostVoteTurns([]);
    setPostVoteCurrentReply("");
    setIsPostVoteChatting(false);
    setRestoredSessionId(null);
  }, [reset]);

  const isStreaming = status === "streaming";
  const isDone = status === "done";
  const hasContent = !!(leftText || rightText);
  const canVote = isDone && !voteState.choice && !voteState.isSubmitting;

  const leftStreaming = isStreaming && !leftDone;
  const rightStreaming = isStreaming && !rightDone;

  const revealLeft = voteState.result?.revealed_left;
  const revealRight = voteState.result?.revealed_right;

  const revealedLeftLabel = armLabel(revealLeft?.arm);
  const revealedRightLabel = armLabel(revealRight?.arm);

  const getWinnerStatus = (side: "left" | "right"): boolean | undefined => {
    if (!voteState.isRevealed) return undefined;
    if (voteState.choice === "tie" || voteState.choice === "both_bad") {
      return undefined;
    }
    return voteState.choice === side;
  };

  const strategySubtitle = useMemo(() => {
    const parts: string[] = [];
    if (meta?.strategy_name) parts.push(String(meta.strategy_name));
    if (meta?.template_id) parts.push(`template=${String(meta.template_id)}`);
    if (meta?.template_emotion) parts.push(`emotion=${String(meta.template_emotion)}`);
    if (meta?.template_intensity) parts.push(`intensity=${String(meta.template_intensity)}`);
    return parts.join(" · ") || undefined;
  }, [meta]);

  const judgeScoresLeft: AiJudgeScores | null = useMemo(() => {
    const scores = voteState.result?.ai_scores;
    if (!scores) return null;
    if (revealLeft?.arm === "baseline") return scores.model_a || null;
    if (revealLeft?.arm) return scores.model_b || null;
    return null;
  }, [voteState.result, revealLeft?.arm]);

  const judgeScoresRight: AiJudgeScores | null = useMemo(() => {
    const scores = voteState.result?.ai_scores;
    if (!scores) return null;
    if (revealRight?.arm === "baseline") return scores.model_a || null;
    if (revealRight?.arm) return scores.model_b || null;
    return null;
  }, [voteState.result, revealRight?.arm]);

  // Auto-scroll to bottom on new content
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current && (isStreaming || conversationHistory.length > 0)) {
      const timer = setTimeout(() => {
        chatContainerRef.current?.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [conversationHistory.length, leftText, rightText, isStreaming]);

  return (
    <div className="flex h-screen bg-surface-primary text-text-primary overflow-hidden">
      {/* Desktop sidebar */}
      <div 
        className={cn(
          "hidden md:block shrink-0 transition-[width] duration-300 ease-in-out",
          sidebarCollapsed ? "w-[60px]" : "w-[260px]"
        )}
      >
        <Sidebar 
          className="h-full" 
          userEmail={userEmail} 
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />
      </div>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeSidebar}
          />
          <div className="absolute left-0 top-0 h-full w-[80vw] max-w-[300px]">
            <Sidebar className="h-full" onNavigate={closeSidebar} userEmail={userEmail} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col relative h-full">
        {/* Top Header */}
        <header className="flex shrink-0 items-center justify-between px-4 h-14 border-b border-border-faint bg-surface-primary">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={sidebarOpen ? closeSidebar : openSidebar}
              className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-elevated text-text-primary transition-colors"
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <ModelSelector
              selectedModelKey={selectedModelKey}
              onModelChange={handleModelChange}
              onDefaultLoaded={handleDefaultModelLoaded}
              disabled={isStreaming}
            />
          </div>

          <div className="flex items-center gap-2">
            {hasContent && (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="hidden sm:inline">New Round</span>
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Chat Area */}
        <main ref={chatContainerRef} className="flex-1 overflow-y-auto relative scrollbar-thin">
          <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 pb-40">
            <AnimatePresence mode="wait">
              {status === "idle" && !hasContent && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex flex-col items-center justify-center py-32 text-center"
                >
                  <div className="mb-8 rounded-2xl bg-surface-tertiary p-6 shadow-soft">
                    <Swords className="h-12 w-12 text-text-primary" />
                  </div>
                  <h2 className="mb-4 text-3xl font-bold tracking-tight text-text-primary">
                    Model Arena
                  </h2>
                  <p className="max-w-md text-text-secondary text-lg">
                    Benchmark & Compare the Best AI Models
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {(error || voteState.error) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 rounded-xl border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-red-300"
              >
                {voteState.error || error}
              </motion.div>
            )}

            {(hasContent || isStreaming) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col"
              >
                {/* Historical conversation turns */}
                {conversationHistory.map((turn, idx) => (
                  <ConversationTurnBlock
                    key={turn.turn}
                    turnIndex={turn.turn}
                    userMessage={turn.user}
                    leftContent={turn.reply_a}
                    rightContent={turn.reply_b}
                    leftAnonymousLabel="Model A"
                    rightAnonymousLabel="Model B"
                    leftRevealed={
                      voteState.isRevealed
                        ? {
                            label: "Model A",
                          }
                        : undefined
                    }
                    rightRevealed={
                      voteState.isRevealed
                        ? {
                            label: "Model B",
                          }
                        : undefined
                    }
                    leftIsStreaming={false}
                    rightIsStreaming={false}
                    isRevealed={voteState.isRevealed}
                    leftIsWinner={getWinnerStatus("left")}
                    rightIsWinner={getWinnerStatus("right")}
                    leftJudgeScores={judgeScoresLeft}
                    rightJudgeScores={judgeScoresRight}
                    judgeLoading={voteState.isSubmitting}
                    winnerSide={winnerSide}
                    isLastTurn={idx === conversationHistory.length - 1 && status !== "streaming"}
                    postVoteTurns={postVoteTurns}
                    postVoteCurrentReply={postVoteCurrentReply}
                    isPostVoteChatting={isPostVoteChatting}
                  />
                ))}

                {/* Current streaming turn (when actively streaming) */}
                {isStreaming && prompt && !conversationHistory.some(t => t.turn === (currentTurn || 1)) && (
                  <ConversationTurnBlock
                    key="current-streaming"
                    turnIndex={currentTurn || conversationHistory.length + 1}
                    userMessage={prompt}
                    leftContent={leftText}
                    rightContent={rightText}
                    leftAnonymousLabel="Model A"
                    rightAnonymousLabel="Model B"
                    leftIsStreaming={leftStreaming}
                    rightIsStreaming={rightStreaming}
                    isRevealed={false}
                    winnerSide={null}
                    isLastTurn={true}
                  />
                )}

                {/* Vote Section */}
                <AnimatePresence>
                  {isDone && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="w-full flex justify-center py-4"
                    >
                      <div className="w-full max-w-3xl">
                        {!voteState.isRevealed && (
                          <div className="text-center mb-6">
                            <h3 className="text-lg font-semibold text-text-primary mb-1">
                              Which response is better?
                            </h3>
                            <p className="text-sm text-text-muted">
                              Choose the best model to reveal their identities
                            </p>
                          </div>
                        )}

                        <VoteButtons
                          onVote={handleVote}
                          disabled={!canVote || voteState.isSubmitting}
                          votedChoice={voteState.choice}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </main>

        {/* Bottom Input Area - Floating */}
        <div className="absolute bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-20 bg-gradient-to-t from-surface-primary via-surface-primary/80 to-transparent pointer-events-none">
          <div className="pointer-events-auto">
            <PromptInput
              onSubmit={handleSubmitPrompt}
              disabled={isStreaming || isPostVoteChatting || (voteState.isRevealed && !winnerSide)}
              placeholder={
                isStreaming
                  ? "Generating..."
                  : isPostVoteChatting
                    ? "Generating..."
                    : voteState.isRevealed && winnerSide
                      ? "Continue chatting with the winner..."
                      : voteState.isRevealed
                        ? "Vote completed. Start a new round."
                        : "Message Model Arena..."
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
