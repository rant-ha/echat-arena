"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { PromptInput } from "@/components/PromptInput";
import { cn } from "@/components/ui";

export function HomeClient(props: { userEmail?: string | null }) {
  const { userEmail } = props;

  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  const handleSubmitPrompt = useCallback(
    (prompt: string) => {
      const q = new URLSearchParams({ prompt });
      router.push(`/battle?${q.toString()}`);
    },
    [router]
  );

  return (
    <div className="flex min-h-screen bg-[var(--main-bg)] text-[var(--text-primary)]">
      {/* Desktop sidebar */}
      <div className="hidden md:block md:w-[260px] md:shrink-0">
        <div className="sticky top-0 h-screen">
          <Sidebar className="h-screen" userEmail={userEmail} />
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
            <Sidebar className="h-full" onNavigate={closeSidebar} userEmail={userEmail} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar - Model Selector */}
        <header className="sticky top-0 z-40 px-4 py-3">
          <div className="flex items-center">
            {/* Mobile menu button */}
            <button
              type="button"
              onClick={sidebarOpen ? closeSidebar : openSidebar}
              className={cn(
                "md:hidden",
                "inline-flex h-10 w-10 items-center justify-center rounded-lg",
                "hover:bg-white/10 transition-colors",
                "text-[var(--text-primary)]"
              )}
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* Model Selector (ChatGPT style dropdown) */}
            <button
              type="button"
              className={cn(
                "flex items-center gap-1 rounded-lg px-3 py-2",
                "text-lg font-semibold text-[var(--text-primary)]",
                "hover:bg-white/10 transition-colors"
              )}
            >
              Model Arena
              <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
            </button>
          </div>
        </header>

        {/* Main Content - Centered */}
        <main className="flex flex-1 flex-col items-center justify-center px-4 pb-32">
          {/* Welcome text */}
          <h1 className="mb-8 text-center text-[2.5rem] font-bold text-[var(--text-primary)]">
            What can I help with?
          </h1>

          {/* Centered Input */}
          <div className="w-full max-w-[680px]">
            <PromptInput
              onSubmit={handleSubmitPrompt}
              placeholder="Ask anything"
              variant="home"
            />
          </div>
        </main>
      </div>
    </div>
  );
}
