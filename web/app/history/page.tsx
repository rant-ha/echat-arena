"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { cn, Card } from "@/components/ui";

type VoteChoice = "model_a" | "model_b" | "tie" | "both_bad" | string;

type AiJudgeScores = {
  empathy_score?: number;
  emotional_safety_score?: number;
  helpfulness_score?: number;
  comment?: string;
};

type VoteRow = {
  id: string;
  created_at: string;
  session_id: string;
  prompt: string;
  reply_a: string;
  reply_b: string;
  user_vote: VoteChoice | null;
  ai_scores: any;
  model_config: any;
};

function truncate(text: string, maxLen: number) {
  const t = (text || "").trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1) + "…";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function voteLabel(v: VoteChoice | null): string {
  if (!v) return "—";
  if (v === "model_a") return "选了 Baseline (A)";
  if (v === "model_b") return "选了 Strategy (B)";
  if (v === "tie") return "平局";
  if (v === "both_bad") return "都不行";
  return String(v);
}

function toAiJudgeScores(value: any): AiJudgeScores | null {
  if (!value) return null;
  if (typeof value === "object") return value as AiJudgeScores;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed as AiJudgeScores;
    } catch {
      return null;
    }
  }
  return null;
}

function totalAiScore(s: AiJudgeScores | null): number | null {
  if (!s) return null;
  const a = typeof s.empathy_score === "number" ? s.empathy_score : null;
  const b =
    typeof s.emotional_safety_score === "number" ? s.emotional_safety_score : null;
  const c = typeof s.helpfulness_score === "number" ? s.helpfulness_score : null;
  if (a === null || b === null || c === null) return null;
  // 3 scores in [1..5], total in [3..15]
  return a + b + c;
}

function extractAiScores(ai_scores: any): {
  baseline: AiJudgeScores | null;
  strategy: AiJudgeScores | null;
} {
  // Backend stores:
  // ai_scores = { model_a: {..}, model_b: {..} }
  const obj = ai_scores && typeof ai_scores === "object" ? ai_scores : null;
  const a = toAiJudgeScores(obj?.model_a);
  const b = toAiJudgeScores(obj?.model_b);
  return { baseline: a, strategy: b };
}

export default function HistoryPage() {
  const [rows, setRows] = useState<VoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const supabase = createSupabaseBrowserClient();

        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser();

        if (authErr) throw authErr;
        if (!user) throw new Error("未登录");

        const { data, error: dbErr } = await supabase
          .from("votes")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);

        if (dbErr) throw dbErr;

        if (!cancelled) {
          setRows((data as VoteRow[]) || []);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const headerStats = useMemo(() => {
    const total = rows.length;
    const winsBaseline = rows.filter((r) => r.user_vote === "model_a").length;
    const winsStrategy = rows.filter((r) => r.user_vote === "model_b").length;
    return { total, winsBaseline, winsStrategy };
  }, [rows]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-card/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <History className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                History
              </h1>
              <p className="text-xs text-muted">
                共 {headerStats.total} 条；你更偏好 Baseline: {headerStats.winsBaseline}
                ，Strategy: {headerStats.winsStrategy}
              </p>
            </div>
          </div>
          <a
            href="/battle"
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm text-muted transition-colors",
              "hover:bg-white/5 hover:text-foreground"
            )}
          >
            去 Battle
          </a>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto pb-10">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          {loading ? (
            <Card className="p-5">
              <p className="text-sm text-muted">加载中…</p>
            </Card>
          ) : error ? (
            <Card className="border-red-400/30 bg-red-500/10 p-5">
              <p className="text-sm text-red-300">{error}</p>
              <p className="mt-2 text-xs text-muted">
                如果你刚登录/注册，刷新一次页面通常即可（依赖 Supabase cookie 同步）。
              </p>
            </Card>
          ) : rows.length === 0 ? (
            <Card className="p-5">
              <p className="text-sm text-muted">
                暂无历史记录。去 <a className="text-primary hover:underline" href="/battle">/battle</a> 完成一次投票后再来。
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {rows.map((r) => {
                const isOpen = !!expanded[r.id];
                const scores = extractAiScores(r.ai_scores);
                const baselineTotal = totalAiScore(scores.baseline);
                const strategyTotal = totalAiScore(scores.strategy);
                const strategyWinsByAi =
                  baselineTotal !== null &&
                  strategyTotal !== null &&
                  strategyTotal > baselineTotal;

                return (
                  <Card key={r.id} className="p-0">
                    <button
                      type="button"
                      onClick={() => toggle(r.id)}
                      className={cn(
                        "flex w-full items-start justify-between gap-4 p-5 text-left",
                        "hover:bg-white/5"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-xs text-muted">
                            {formatTime(r.created_at)}
                          </span>
                          <span className="text-xs text-muted">•</span>
                          <span className="text-xs text-muted">
                            {voteLabel(r.user_vote)}
                          </span>
                        </div>

                        <h3 className="mt-2 line-clamp-2 text-sm font-medium text-foreground/90">
                          {truncate(r.prompt, 140)}
                        </h3>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="rounded-xl border border-border/50 bg-card/40 px-4 py-3">
                            <p className="text-xs text-muted">AI Score (Baseline A)</p>
                            <p className="mt-1 font-mono text-sm text-foreground">
                              {baselineTotal ?? "—"}
                              {baselineTotal !== null ? " / 15" : ""}
                            </p>
                          </div>
                          <div className="rounded-xl border border-border/50 bg-card/40 px-4 py-3">
                            <p className="text-xs text-muted">AI Score (Strategy B)</p>
                            <p
                              className={cn(
                                "mt-1 font-mono text-sm",
                                strategyWinsByAi ? "text-green-300" : "text-foreground"
                              )}
                            >
                              {strategyTotal ?? "—"}
                              {strategyTotal !== null ? " / 15" : ""}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-1 flex shrink-0 items-center gap-2 text-muted">
                        <span className="text-xs">详情</span>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-border/50 p-5">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="rounded-2xl border border-border/50 bg-card/50 p-4">
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                                  Baseline (A)
                                </p>
                                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                                  {r.reply_a}
                                </pre>
                              </div>
                              <div className="rounded-2xl border border-border/50 bg-card/50 p-4">
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                                  Strategy (B)
                                </p>
                                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                                  {r.reply_b}
                                </pre>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                              <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                                <p className="text-xs text-muted">AI Judge (A)</p>
                                <p className="mt-1 text-sm text-foreground/90">
                                  empathy={scores.baseline?.empathy_score ?? "—"}, safety=
                                  {scores.baseline?.emotional_safety_score ?? "—"}, helpful=
                                  {scores.baseline?.helpfulness_score ?? "—"}
                                </p>
                                {scores.baseline?.comment ? (
                                  <p className="mt-2 text-xs text-muted">
                                    {scores.baseline.comment}
                                  </p>
                                ) : null}
                              </div>

                              <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                                <p className="text-xs text-muted">AI Judge (B)</p>
                                <p className="mt-1 text-sm text-foreground/90">
                                  empathy={scores.strategy?.empathy_score ?? "—"}, safety=
                                  {scores.strategy?.emotional_safety_score ?? "—"}, helpful=
                                  {scores.strategy?.helpfulness_score ?? "—"}
                                </p>
                                {scores.strategy?.comment ? (
                                  <p className="mt-2 text-xs text-muted">
                                    {scores.strategy.comment}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-4 text-xs text-muted">
                              session_id: <span className="font-mono">{r.session_id}</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
