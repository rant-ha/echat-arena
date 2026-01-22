"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef, useCallback, useMemo } from "react";
import { cn } from "./ui";
import { VariableSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { Copy, Maximize2, Check } from "lucide-react";
import { useState } from "react";

export type ResponseCardReveal = {
  label?: string;
  subtitle?: string;
  modelId?: string; // Optional: for logos if we had them
};

export type AiJudgeScores = {
  empathy_score?: number;
  emotional_safety_score?: number;
  helpfulness_score?: number;
  comment?: string;
};

export interface ConversationTurn {
  turn: number;
  user: string;
  reply: string;
}

// 投票后对话的轮次类型
interface PostVoteTurn {
  turn_index: number;
  user_message: string;
  assistant_message: string;
  created_at: string;
}

interface ResponseCardProps {
  side: "left" | "right";
  anonymousLabel: string;
  revealed?: ResponseCardReveal;
  // 新增：对话历史数组
  conversationHistory?: ConversationTurn[];
  // 修改：content 改为可选，表示当前正在生成的回复
  content?: string;
  isStreaming: boolean;
  isRevealed: boolean;
  isWinner?: boolean;
  judgeScores?: AiJudgeScores | null;
  judgeLoading?: boolean;
  // 投票后对话相关
  isLoser?: boolean;
  postVoteTurns?: PostVoteTurn[];
  postVoteCurrentReply?: string;
  isPostVoteChatting?: boolean;
}

// 高度缓存
const itemHeightCache = new Map<string, Map<number, number>>();

// 对话轮次渲染组件
interface ConversationTurnRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    turns: ConversationTurn[];
    currentReply?: string;
    isStreaming: boolean;
    cacheKey: string;
    onHeightChange: (index: number, height: number) => void;
    side: "left" | "right";
  };
}

const ConversationTurnRow = ({ index, style, data }: ConversationTurnRowProps) => {
  const { turns, currentReply, isStreaming, cacheKey, onHeightChange, side } = data;
  const rowRef = useRef<HTMLDivElement>(null);
  const turn = turns[index];
  const isLastTurn = index === turns.length - 1;
  const showCurrentReply = isLastTurn && currentReply && currentReply.trim().length > 0;

  // 测量实际高度并更新缓存
  useEffect(() => {
    if (rowRef.current) {
      const height = rowRef.current.getBoundingClientRect().height;
      onHeightChange(index, height);
    }
  }, [index, turn, currentReply, onHeightChange]);

  return (
    <div style={style}>
      <div ref={rowRef} className="px-3 pb-6">
        <div className="space-y-4">
          {/* 轮次分隔线 - Optional, keeping minimal */}
          {index > 0 && (
            <div className="flex items-center gap-2 py-2 opacity-50">
              <div className="h-px flex-1 bg-border-faint" />
            </div>
          )}

          {/* 用户输入气泡 */}
          <div className="flex justify-end">
            <div className="max-w-[90%] rounded-2xl bg-surface-elevated px-4 py-2.5 text-text-primary">
              <div className="prose prose-sm prose-invert max-w-none break-words">
                <ReactMarkdown>{turn.user}</ReactMarkdown>
              </div>
            </div>
          </div>

          {/* AI 回复气泡 */}
          <div className="flex justify-start w-full">
            <div className="w-full rounded-xl bg-transparent text-text-secondary">
              <div className="prose prose-sm prose-invert max-w-none break-words prose-pre:bg-surface-primary prose-pre:border prose-pre:border-border-faint prose-code:bg-surface-elevated prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                <ReactMarkdown>{turn.reply}</ReactMarkdown>
              </div>
            </div>
          </div>

          {/* 当前正在生成的回复 */}
          {showCurrentReply && (
            <div className="space-y-4 mt-4 pt-4 border-t border-border-faint/50">
              {/* AI 回复气泡（流式生成中） */}
              <div className="flex justify-start w-full">
                <div className="w-full rounded-xl bg-transparent text-text-primary">
                  <div className="prose prose-sm prose-invert max-w-none break-words">
                    <ReactMarkdown>{currentReply}</ReactMarkdown>
                    {isStreaming && (
                      <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-interactive-accent align-middle" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export function ResponseCard({
  side,
  anonymousLabel,
  revealed,
  conversationHistory = [],
  content = "",
  isStreaming,
  isRevealed,
  isWinner,
  judgeScores,
  judgeLoading,
  isLoser = false,
  postVoteTurns = [],
  postVoteCurrentReply = "",
  isPostVoteChatting = false,
}: ResponseCardProps) {
  const listRef = useRef<List>(null);
  const cacheKey = `${side}-${anonymousLabel}`;
  const [copied, setCopied] = useState(false);

  // 初始化缓存
  if (!itemHeightCache.has(cacheKey)) {
    itemHeightCache.set(cacheKey, new Map());
  }
  const cache = itemHeightCache.get(cacheKey)!;

  const hasHistory = conversationHistory.length > 0;
  const hasCurrentReply = content.trim().length > 0;
  const hasAnyContent = hasHistory || hasCurrentReply;

  // Copy functionality
  const handleCopy = () => {
    const lastReply = hasCurrentReply 
      ? content 
      : conversationHistory[conversationHistory.length - 1]?.reply;
      
    if (lastReply) {
      navigator.clipboard.writeText(lastReply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 估算项目高度
  const estimateItemSize = useCallback(
    (index: number) => {
      if (cache.has(index)) return cache.get(index)!;
      return 200; // Default estimate
    },
    [cache]
  );

  // 高度变化回调
  const handleHeightChange = useCallback(
    (index: number, height: number) => {
      const currentHeight = cache.get(index);
      if (currentHeight !== height) {
        cache.set(index, height);
        listRef.current?.resetAfterIndex(index, false);
      }
    },
    [cache]
  );

  // 自动滚动到最新消息
  useEffect(() => {
    if (listRef.current && conversationHistory.length > 0) {
      const timer = setTimeout(() => {
        listRef.current?.scrollToItem(conversationHistory.length - 1, "end");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [conversationHistory.length, content]);

  const listData = useMemo(
    () => ({
      turns: conversationHistory,
      currentReply: content,
      isStreaming,
      cacheKey,
      onHeightChange: handleHeightChange,
      side,
    }),
    [conversationHistory, content, isStreaming, cacheKey, handleHeightChange, side]
  );

  // 渲染投票后对话
  const renderPostVoteChat = () => {
    if (postVoteTurns.length === 0 && !postVoteCurrentReply) return null;

    return (
      <div className="space-y-4 mt-6 pt-6 border-t border-border-faint">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-medium text-interactive-accent uppercase tracking-wider">Continued Chat</span>
        </div>

        {postVoteTurns.map((turn) => (
          <div key={turn.turn_index} className="space-y-4">
            <div className="flex justify-end">
              <div className="max-w-[90%] rounded-2xl bg-surface-elevated px-4 py-2.5 text-text-primary">
                <div className="prose prose-sm prose-invert max-w-none break-words">
                  <ReactMarkdown>{turn.user_message}</ReactMarkdown>
                </div>
              </div>
            </div>

            <div className="flex justify-start w-full">
              <div className="w-full rounded-xl bg-transparent text-text-secondary">
                <div className="prose prose-sm prose-invert max-w-none break-words">
                  <ReactMarkdown>{turn.assistant_message}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        ))}

        {postVoteCurrentReply && (
          <div className="flex justify-start w-full">
            <div className="w-full rounded-xl bg-transparent text-text-primary">
              <div className="prose prose-sm prose-invert max-w-none break-words">
                <ReactMarkdown>{postVoteCurrentReply}</ReactMarkdown>
                {isPostVoteChatting && (
                  <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-interactive-accent align-middle" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 渲染对话内容
  const renderConversationContent = () => {
    if (!hasAnyContent && postVoteTurns.length === 0) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-text-muted">Waiting for response...</p>
        </div>
      );
    }

    if (conversationHistory.length < 5) {
      return (
        <div className="flex flex-col gap-0 overflow-y-auto px-1 scrollbar-thin h-full">
          {conversationHistory.map((turn, idx) => (
            <div key={`turn-${turn.turn}`} className="space-y-4 mb-6">
              {idx > 0 && (
                <div className="flex items-center justify-center py-2 opacity-30">
                  <div className="h-px w-8 bg-border-strong" />
                </div>
              )}

              {/* User Bubble */}
              <div className="flex justify-end">
                <div className="max-w-[90%] rounded-2xl bg-surface-elevated px-4 py-2.5 text-text-primary shadow-sm">
                  <div className="prose prose-sm prose-invert max-w-none break-words leading-relaxed">
                    <ReactMarkdown>{turn.user}</ReactMarkdown>
                  </div>
                </div>
              </div>

              {/* AI Bubble */}
              <div className="flex justify-start w-full group/msg">
                <div className="w-full pl-1 pr-2">
                  <div className="prose prose-sm prose-invert max-w-none break-words leading-relaxed text-text-secondary prose-pre:bg-surface-primary prose-pre:border prose-pre:border-border-faint prose-code:bg-surface-elevated prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                    <ReactMarkdown>{turn.reply}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {hasCurrentReply && (
            <div className="space-y-4 mb-4">
              {conversationHistory.length > 0 && (
                <div className="flex items-center justify-center py-2 opacity-30">
                  <div className="h-px w-8 bg-border-strong" />
                </div>
              )}
              <div className="flex justify-start w-full">
                <div className="w-full pl-1 pr-2">
                  <div className="prose prose-sm prose-invert max-w-none break-words leading-relaxed text-text-primary">
                    <ReactMarkdown>{content}</ReactMarkdown>
                    {isStreaming && (
                      <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-interactive-accent align-middle" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isLoser && renderPostVoteChat()}
        </div>
      );
    }

    return (
      <AutoSizer>
        {({ height, width }) => (
          <List
            ref={listRef}
            height={height}
            width={width}
            itemCount={conversationHistory.length}
            itemSize={estimateItemSize}
            itemData={listData}
            className="scrollbar-thin"
            overscanCount={2}
          >
            {ConversationTurnRow}
          </List>
        )}
      </AutoSizer>
    );
  };

  return (
    <div
      className={cn(
        "perspective-1000 h-full w-full transition-all duration-300",
        isLoser ? "grayscale opacity-60 pointer-events-none" : ""
      )}
    >
      <motion.div
        className="relative h-full w-full"
        initial={false}
        animate={{ rotateY: isRevealed ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} // smooth cubic bezier
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Front Face */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col overflow-hidden",
            "rounded-xl border border-border-faint bg-surface-tertiary",
            "shadow-card transition-colors duration-300",
            isWinner === true && "border-interactive-accent ring-1 ring-interactive-accent/50"
          )}
          style={{ backfaceVisibility: "hidden" }}
        >
          {/* Header */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border-faint bg-surface-tertiary px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-text-secondary uppercase tracking-wide">
                {/* Placeholder Logo */}
                <div className="h-4 w-4 rounded-sm bg-surface-elevated" />
                {anonymousLabel}
              </span>
            </div>
            
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 duration-200">
              <button
                onClick={handleCopy}
                className="rounded p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
                title="Copy response"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button
                className="rounded p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
                title="Maximize"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden p-3 relative bg-surface-tertiary">
             {renderConversationContent()}
          </div>
        </div>

        {/* Back Face (Revealed) */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col overflow-hidden",
            "rounded-xl border border-border-faint bg-surface-tertiary",
            "shadow-card",
            isWinner === true && "border-interactive-accent ring-1 ring-interactive-accent/50"
          )}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {/* Revealed Header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-faint bg-surface-tertiary px-4">
            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-text-primary">
                  {revealed?.label || (side === "left" ? "Model A" : "Model B")}
                </span>
                {isWinner === true && (
                  <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-bold text-green-400 uppercase tracking-wider">
                    Winner
                  </span>
                )}
              </div>
              {revealed?.subtitle && (
                <span className="truncate text-[10px] text-text-muted">
                  {revealed.subtitle}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-1">
               <button
                onClick={handleCopy}
                className="rounded p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden p-3 bg-surface-tertiary">
            {renderConversationContent()}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
