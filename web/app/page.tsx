import { createSupabaseServerClient } from "@/utils/supabase/server";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">Empathy Arena</h1>
        <p className="mt-2 text-muted">
          已登录：{user?.email || "(unknown)"}
        </p>

        <div className="mt-8 rounded-xl border border-border bg-card/70 p-6">
          <p className="text-sm text-muted">
            该前端工程已初始化：Supabase SSR 鉴权 + API Proxy (支持 SSE) +
            登录/注册页。
          </p>
          <p className="mt-3 text-sm text-muted">
            你可以在后续子任务中实现 /battle UI，并通过
            <code className="mx-1 rounded bg-white/5 px-1 py-0.5 text-xs">
              /api/proxy/api/arena/battle
            </code>
            调用后端 SSE。
          </p>
        </div>
      </div>
    </main>
  );
}
