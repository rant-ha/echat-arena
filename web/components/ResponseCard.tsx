"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef, useCallback, useMemo } from "react";
import { cn } from "./ui";
import { VariableSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";

export type ResponseCardReveal = {
  label?: string;
  subtitle?: string;
};

export type AiJudgeScores = {
  empathy_score?: number;
  emotional_safety_score?: number;
  helpfulness_score?: number;
  comment?: string;
};

function totalAiScore(s: AiJudgeScores | null | undefined): number | null {
  if (!s) return null;
  const a = typeof s.empathy_score === "number" ? s.empathy_score : null;
  const b =
    typeof s.emotional_safety_score === "number" ? s.emotional_safety_score : null;
  const c = typeof s.helpfulness_score === "number" ? s.helpfulness_score : null;
  if (a === null || b === null || c === null) return null;
  return a + b + c;
}

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
  };
}

const ConversationTurnRow = ({ index, style, data }: ConversationTurnRowProps) => {
  const { turns, currentReply, isStreaming, cacheKey, onHeightChange } = data;
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
      <div ref={rowRef} className="px-2 pb-4">
        <div className="space-y-3">
          {/* 轮次分隔线 */}
          {index > 0 && (
            <div className="flex items-center gap-2 py-1">
              <div className="h-px flex-1 bg-[var(--border-color)]" />
              <span className="text-xs text-[var(--text-muted)]">第 {turn.turn} 轮</span>
              <div className="h-px flex-1 bg-[var(--border-color)]" />
            </div>
          )}

          {/* 用户输入气泡 */}
          <div className="flex justify-end">
            <div className="max-w-[85%] md:max-w-[80%] rounded-2xl bg-blue-600 px-4 py-2 text-white">
              <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                <ReactMarkdown>{turn.user}</ReactMarkdown>
              </div>
            </div>
          </div>

          {/* AI 回复气泡 */}
          <div className="flex justify-start">
            <div className="max-w-[85%] md:max-w-[80%] rounded-2xl bg-zinc-800 px-4 py-3 text-zinc-100">
              <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                <ReactMarkdown>{turn.reply}</ReactMarkdown>
              </div>
            </div>
          </div>

          {/* 当前正在生成的回复 */}
          {showCurrentReply && (
            <div className="space-y-3 mt-3">
              <div className="flex items-center gap-2 py-1">
                <div className="h-px flex-1 bg-[var(--border-color)]" />
                <span className="text-xs text-[var(--text-muted)]">
                  第 {turns.length + 1} 轮
                </span>
                <div className="h-px flex-1 bg-[var(--border-color)]" />
              </div>

              {/* AI 回复气泡（流式生成中） */}
              <div className="flex justify-start">
                <div className="max-w-[85%] md:max-w-[80%] rounded-2xl bg-zinc-800 px-4 py-3 text-zinc-100">
                  <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                    <ReactMarkdown>{currentReply}</ReactMarkdown>
                    {isStreaming && (
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-zinc-100" />
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
  const total = totalAiScore(judgeScores);
  const listRef = useRef<List>(null);
  const cacheKey = `${side}-${anonymousLabel}`;

  // 初始化缓存
  if (!itemHeightCache.has(cacheKey)) {
    itemHeightCache.set(cacheKey, new Map());
  }
  const cache = itemHeightCache.get(cacheKey)!;

  // 判断是否有内容显示
  const hasHistory = conversationHistory.length > 0;
  const hasCurrentReply = content.trim().length > 0;
  const hasAnyContent = hasHistory || hasCurrentReply;

  // 估算项目高度
  const estimateItemSize = useCallback(
    (index: number) => {
      // 从缓存读取
      if (cache.has(index)) {
        return cache.get(index)!;
      }

      // 估算高度
      const turn = conversationHistory[index];
      if (!turn) return 200;

      const isLastTurn = index === conversationHistory.length - 1;
      const showCurrentReply = isLastTurn && hasCurrentReply;

      // 基础高度计算
      const userMsgHeight = Math.max(60, Math.ceil(turn.user.length / 50) * 30);
      const replyHeight = Math.max(80, Math.ceil(turn.reply.length / 50) * 30);
      let totalHeight = userMsgHeight + replyHeight + 80; // 80 为间距和分隔线

      // 如果是最后一轮且有当前回复，增加额外高度
      if (showCurrentReply) {
        const currentReplyHeight = Math.max(80, Math.ceil(content.length / 50) * 30);
        totalHeight += currentReplyHeight + 60; // 额外的分隔线和间距
      }

      return totalHeight;
    },
    [conversationHistory, hasCurrentReply, content, cache]
  );

  // 高度变化回调
  const handleHeightChange = useCallback(
    (index: number, height: number) => {
      const currentHeight = cache.get(index);
      if (currentHeight !== height) {
        cache.set(index, height);
        // 重置该索引之后的所有项
        listRef.current?.resetAfterIndex(index, false);
      }
    },
    [cache]
  );

  // 自动滚动到最新消息
  useEffect(() => {
    if (listRef.current && conversationHistory.length > 0) {
      // 延迟滚动以确保内容已渲染
      const timer = setTimeout(() => {
        listRef.current?.scrollToItem(conversationHistory.length - 1, "end");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [conversationHistory.length, content]);

  // 性能监控（开发模式）
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && conversationHistory.length > 0) {
      const avgItemHeight = 200; // 平均项高度估算
      const viewportHeight = 600; // 假设可见区域高度
      const visibleItems = Math.ceil(viewportHeight / avgItemHeight);
      const renderRatio = (visibleItems / conversationHistory.length) * 100;

      console.log(`[Virtual Scroll Performance - ${side}]`, {
        totalTurns: conversationHistory.length,
        estimatedVisibleTurns: visibleItems,
        renderRatio: `${renderRatio.toFixed(2)}%`,
        cacheSize: cache.size,
      });
    }
  }, [conversationHistory.length, side, cache.size]);

  // 准备列表数据
  const listData = useMemo(
    () => ({
      turns: conversationHistory,
      currentReply: content,
      isStreaming,
      cacheKey,
      onHeightChange: handleHeightChange,
    }),
    [conversationHistory, content, isStreaming, cacheKey, handleHeightChange]
  );

  // 渲染投票后对话
  const renderPostVoteChat = () => {
    if (postVoteTurns.length === 0 && !postVoteCurrentReply) return null;

    return (
      <div className="space-y-3 mt-4">
        {/* 分隔线 */}
        <div className="flex items-center gap-2 py-2">
          <div className="h-px flex-1 bg-blue-500/50" />
          <span className="text-xs text-blue-400 font-medium">投票后继续对话</span>
          <div className="h-px flex-1 bg-blue-500/50" />
        </div>

        {/* 渲染投票后的轮次 */}
        {postVoteTurns.map((turn) => (
          <div key={turn.turn_index} className="space-y-3">
            {/* 用户消息 */}
            <div className="flex justify-end">
              <div className="max-w-[85%] md:max-w-[80%] rounded-2xl bg-blue-600 px-4 py-2 text-white">
                <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                  <ReactMarkdown>{turn.user_message}</ReactMarkdown>
                </div>
              </div>
            </div>

            {/* AI 回复 */}
            <div className="flex justify-start">
              <div className="max-w-[85%] md:max-w-[80%] rounded-2xl bg-zinc-800 px-4 py-3 text-zinc-100">
                <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                  <ReactMarkdown>{turn.assistant_message}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* 当前正在生成的回复 */}
        {postVoteCurrentReply && (
          <div className="flex justify-start">
            <div className="max-w-[85%] md:max-w-[80%] rounded-2xl bg-zinc-800 px-4 py-3 text-zinc-100">
              <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                <ReactMarkdown>{postVoteCurrentReply}</ReactMarkdown>
                {isPostVoteChatting && (
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-zinc-100" />
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
          <p className="text-sm text-[var(--text-muted)]">等待回复...</p>
        </div>
      );
    }

    // 对于短对话（少于 5 轮），使用传统渲染以保持最佳体验
    if (conversationHistory.length < 5) {
      return (
        <div
          className="flex flex-col gap-4 overflow-y-auto pr-2 scrollbar-thin"
          style={{ maxHeight: "100%" }}
        >
          {conversationHistory.map((turn, idx) => (
            <div key={`turn-${turn.turn}`} className="space-y-3">
              {/* 轮次分隔 */}
              {idx > 0 && (
                <div className="flex items-center gap-2 py-1">
                  <div className="h-px flex-1 bg-[var(--border-color)]" />
                  <span className="text-xs text-[var(--text-muted)]">第 {turn.turn} 轮</span>
                  <div className="h-px flex-1 bg-[var(--border-color)]" />
                </div>
              )}

              {/* 用户输入气泡 */}
              <div className="flex justify-end">
                <div className="max-w-[85%] md:max-w-[80%] rounded-2xl bg-blue-600 px-4 py-2 text-white">
                  <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                    <ReactMarkdown>{turn.user}</ReactMarkdown>
                  </div>
                </div>
              </div>

              {/* AI 回复气泡 */}
              <div className="flex justify-start">
                <div className="max-w-[85%] md:max-w-[80%] rounded-2xl bg-zinc-800 px-4 py-3 text-zinc-100">
                  <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                    <ReactMarkdown>{turn.reply}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* 当前正在生成的回复 */}
          {hasCurrentReply && (
            <div className="space-y-3">
              {conversationHistory.length > 0 && (
                <div className="flex items-center gap-2 py-1">
                  <div className="h-px flex-1 bg-[var(--border-color)]" />
                  <span className="text-xs text-[var(--text-muted)]">
                    第 {conversationHistory.length + 1} 轮
                  </span>
                  <div className="h-px flex-1 bg-[var(--border-color)]" />
                </div>
              )}

              {/* AI 回复气泡（流式生成中） */}
              <div className="flex justify-start">
                <div className="max-w-[85%] md:max-w-[80%] rounded-2xl bg-zinc-800 px-4 py-3 text-zinc-100">
                  <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                    <ReactMarkdown>{content}</ReactMarkdown>
                    {isStreaming && (
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-zinc-100" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 投票后对话 */}
          {!isLoser && renderPostVoteChat()}
        </div>
      );
    }

    // 对于长对话（5 轮及以上），使用虚拟滚动
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
      className="perspective-1000 h-full w-full transition-all duration-300"
      style={isLoser ? {
        filter: 'grayscale(100%) opacity(0.5)',
        pointerEvents: 'none'
      } : undefined}
    >
      <motion.div
        className="relative h-full w-full"
        initial={false}
        animate={{ rotateY: isRevealed ? 180 : 0 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Front face (anonymous) */}
        <div
          className={cn(
            "absolute inset-0 rounded-2xl border p-5",
            "bg-[var(--main-bg)] backdrop-blur-md shadow-md",
            "flex flex-col",
            isWinner === true && "border-green-400/50 ring-2 ring-green-400/30",
            isWinner === false && "border-[var(--border-color)]",
            isWinner === undefined && "border-[var(--border-color)]"
          )}
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              {anonymousLabel}
            </h3>
            {isStreaming && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--text-primary)]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--text-primary)]" />
                Streaming…
              </span>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            {renderConversationContent()}
          </div>
        </div>

        {/* Back face (revealed) */}
        <div
          className={cn(
            "absolute inset-0 rounded-2xl border p-5",
            "bg-[var(--main-bg)] backdrop-blur-md shadow-md",
            "flex flex-col",
            isWinner === true && "border-green-400/50 ring-2 ring-green-400/30",
            isWinner === false && "border-[var(--border-color)]",
            isWinner === undefined && "border-[var(--border-color)]"
          )}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-[var(--text-primary)]">
                {side === "left" ? "Reply A" : "Reply B"}
              </h3>
              {revealed?.label && (
                <p className="text-sm text-[var(--text-muted)]">{revealed.label}</p>
              )}
              {revealed?.subtitle && (
                <p className="text-xs text-[var(--text-muted)] opacity-75">
                  {revealed.subtitle}
                </p>
              )}
            </div>
            {isWinner === true && (
              <span className="shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                Winner
              </span>
            )}
          </div>

          <div className="flex-1 overflow-hidden">
            {renderConversationContent()}
          </div>

          {/* AI Judge scores hidden per user request - data still collected in backend */}
        </div>
      </motion.div>
    </div>
  );
}
