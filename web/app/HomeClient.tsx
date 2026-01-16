"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, X, Swords, History as HistoryIcon } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { PromptInput } from "@/components/PromptInput";
import { Card, cn } from "@/components/ui";

export function HomeClient(props: { userEmail?: string | null }) {
  const { userEmail } = props;

  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  const handleStartBattle = useCallback(() => {
    router.push("/battle");
  }, [router]);

  const handleSubmitPrompt = useCallback(
    (prompt: string) => {
      const q = new URLSearchParams({ prompt });
      router.push(`/battle?${q.toString()}`);
    },
    [router]
  );

  const subtitle = useMemo(() => {
    if (!userEmail) return "双盲对比 · 投票后揭晓 · 记录会进入历史";
    return `${userEmail} · 双盲对比 · 投票后揭晓`;
  }, [userEmail]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <div className="hidden md:block md:w-[260px] md:shrink-0">
        <div className="sticky top-0 h-screen">
          <Sidebar className="h-screen" />
        </div>
      </div>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            className="absolute inset-0 bg-black/50"
            onClick={closeSidebar}
          />
          <div className="absolute left-0 top-0 h-full w-[86vw] max-w-[320px]">
            <Sidebar className="h-full" onNavigate={closeSidebar} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (mobile-first) */}
        <header className="sticky top-0 z-40 border-b border-border/50 bg-card/60 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={sidebarOpen ? closeSidebar : openSidebar}
                className={cn(
                  "md:hidden",
                  "inline-flex h-9 w-9 items-center justify-center rounded-lg",
                  "border border-border/60 bg-background/10",
                  "hover:bg-white/5"
                )}
                aria-label={sidebarOpen ? "Close menu" : "Open menu"}
              >
                {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Swords className="h-5 w-5 text-primary" />
                  <h1 className="truncate text-sm font-semibold">Empathy Arena</h1>
                </div>
                <p className="truncate text-xs text-muted">{subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href="/history"
                className={cn(
                  "hidden sm:inline-flex items-center gap-2 rounded-lg px-3 py-1.5",
                  "text-sm text-muted",
                  "border border-border/60 bg-background/10",
                  "hover:bg-white/5 hover:text-foreground",
                  "transition-colors"
                )}
              >
                <HistoryIcon className="h-4 w-4" />
                History
              </a>

              <button
                type="button"
                onClick={handleStartBattle}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5",
                  "text-sm font-medium text-primary",
                  "border border-primary/40 bg-primary/10",
                  "hover:bg-primary/20 hover:border-primary/60",
                  "transition-colors"
                )}
              >
                <Swords className="h-4 w-4" />
                Start
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-[1fr,420px]">
              {/* Hero */}
              <Card className="p-6">
                <h2 className="text-xl font-semibold">欢迎来到 Empathy Arena</h2>
                <p className="mt-2 text-sm text-muted">
                  发送一个 Prompt，我们会并行生成两路回答（双盲）；生成完成后你可以投票，随后揭晓哪个更好。
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleStartBattle}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl px-4 py-2",
                      "text-sm font-medium",
                      "border border-primary/40 bg-primary/10 text-primary",
                      "hover:bg-primary/20 hover:border-primary/60",
                      "transition-colors"
                    )}
                  >
                    <Swords className="h-4 w-4" />
                    开始新对战
                  </button>

                  <a
                    href="/history"
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl px-4 py-2",
                      "text-sm text-muted",
                      "border border-border/60 bg-background/10",
                      "hover:bg-white/5 hover:text-foreground",
                      "transition-colors"
                    )}
                  >
                    <HistoryIcon className="h-4 w-4" />
                    查看历史
                  </a>
                </div>

                <div className="mt-8">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                    直接输入 Prompt（可选）
                  </div>
                  <PromptInput
                    onSubmit={handleSubmitPrompt}
                    placeholder="输入 Prompt（回车发送），将跳转到 /battle 并自动开始"
                    containerClassName={cn(
                      "static z-auto",
                      "rounded-2xl border border-border/50",
                      "bg-card/40",
                      "border-t-0",
                      "px-0 py-0",
                      "backdrop-blur-xl"
                    )}
                  />
                </div>

                <p className="mt-3 text-xs text-muted">
                  提示：历史列表在左侧侧边栏（移动端点左上角菜单）。
                </p>
              </Card>

              {/* Tips */}
              <div className="space-y-4">
                <Card className="p-5">
                  <h3 className="text-sm font-medium">如何获得更稳定的对比？</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
                    <li>尽量给出清晰的目标、受众和限制条件。</li>
                    <li>对“语气/风格”有要求时直接写在 Prompt 里。</li>
                    <li>回答完成后再投票，投票后会揭晓身份并写入历史。</li>
                  </ul>
                </Card>

                <Card className="p-5">
                  <h3 className="text-sm font-medium">快捷入口</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <a
                      href="/battle"
                      className={cn(
                        "rounded-xl border border-border/60 bg-background/10 px-3 py-2",
                        "text-sm text-muted",
                        "hover:bg-white/5 hover:text-foreground",
                        "transition-colors"
                      )}
                    >
                      /battle
                    </a>
                    <a
                      href="/history"
                      className={cn(
                        "rounded-xl border border-border/60 bg-background/10 px-3 py-2",
                        "text-sm text-muted",
                        "hover:bg-white/5 hover:text-foreground",
                        "transition-colors"
                      )}
                    >
                      /history
                    </a>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
