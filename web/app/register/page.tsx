"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TurnstileCaptcha from "@/components/TurnstileCaptcha";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { Button, Card, ErrorText, Input, Label } from "@/components/ui";

function parseAllowedDomains(raw: string | undefined): string[] {
  const v = (raw || "").trim();
  if (!v) {
    // default allowlist example (spec mentions .edu.cn)
    return [".edu.cn"];
  }
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith(".") ? s.toLowerCase() : `.${s.toLowerCase()}`));
}

function isEmailDomainAllowed(email: string, allowed: string[]): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;

  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return false;

  const normalizedAllowed = allowed
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => (s.startsWith(".") ? s.slice(1) : s));

  return normalizedAllowed.some((s) => domain === s || domain.endsWith(`.${s}`));
}

export default function RegisterPage() {
  const router = useRouter();

  const allowed = useMemo(
    () => parseAllowedDomains(process.env.NEXT_PUBLIC_ALLOWED_DOMAINS),
    []
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captchaEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEmailDomainAllowed(email, allowed)) {
      setError(`该邮箱域名不在允许列表：${allowed.join(", ")}`);
      return;
    }

    if (captchaEnabled && !captchaToken) {
      setError("请先完成验证码校验");
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: captchaEnabled ? { captchaToken } : undefined,
      });
      if (authError) throw authError;

      // If email confirmation is enabled, user may need to confirm.
      router.replace("/battle");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <h1 className="text-xl font-semibold">注册</h1>
          <p className="mt-1 text-sm text-muted">
            仅允许域名：{allowed.join(", ")}
          </p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {captchaEnabled ? (
              <TurnstileCaptcha
                onSuccess={(token) => setCaptchaToken(token)}
                onReset={() => setCaptchaToken("")}
              />
            ) : null}

            {error ? <ErrorText>{error}</ErrorText> : null}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "注册中..." : "注册"}
            </Button>

            <div className="text-center text-sm text-muted">
              已有账号？{" "}
              <a className="text-primary hover:underline" href="/login">
                去登录
              </a>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
