"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { PromptInput } from "@/components/PromptInput";
import { ModelSelector } from "@/components/ModelSelector";
import { cn } from "@/components/ui";

export function HomeClient(props: { userEmail?: string | null; userName?: string | null; userAvatarUrl?: string | null }) {
  const { userEmail, userName, userAvatarUrl } = props;

  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const MODEL_STORAGE_KEY = "echat-arena-v1-selected-model";

  // Web search toggle state
  const [searchEnabled, setSearchEnabled] = useState(false);
  const toggleSearch = useCallback(() => setSearchEnabled(prev => !prev), []);

  // Load model selection from localStorage
  useEffect(() => {
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
      // localStorage might be unavailable
    }
  }, []);

  // Handle default model loaded from API
  const handleDefaultModelLoaded = useCallback((defaultKey: string | null) => {
    if (!selectedModelKey && defaultKey) {
      setSelectedModelKey(defaultKey);
    }
  }, [selectedModelKey]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  const handleSubmitPrompt = useCallback(
    (prompt: string) => {
      const params = new URLSearchParams({ prompt });
      if (selectedModelKey) {
        params.set("model", selectedModelKey);
      }
      if (searchEnabled) {
        params.set("search", "1");
      }
      router.push(`/battle?${params.toString()}`);
    },
    [router, selectedModelKey, searchEnabled]
  );

  return (
    <div className="flex min-h-screen bg-[var(--main-bg)] text-[var(--text-primary)]">
      {/* Desktop sidebar */}
      <div className="hidden md:block md:w-[260px] md:shrink-0">
        <div className="sticky top-0 h-screen">
          <Sidebar className="h-screen" userEmail={userEmail} userName={userName} userAvatarUrl={userAvatarUrl} />
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
            <Sidebar className="h-full" onNavigate={closeSidebar} userEmail={userEmail} userName={userName} userAvatarUrl={userAvatarUrl} />
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

            {/* Model Selector */}
            <ModelSelector
              selectedModelKey={selectedModelKey}
              onModelChange={handleModelChange}
              onDefaultLoaded={handleDefaultModelLoaded}
            />
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
              searchEnabled={searchEnabled}
              onSearchToggle={toggleSearch}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
