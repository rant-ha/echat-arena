"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TurnstileCaptcha from "@/components/TurnstileCaptcha";
import GoogleLoginButton from "@/components/GoogleLoginButton";
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
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

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
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: captchaEnabled ? { captchaToken } : undefined,
      });
      if (authError) throw authError;

      // 检查是否需要邮箱验证
      if (!data.session) {
        setRegisteredEmail(email);
        setRegistrationSuccess(true);
      } else {
        router.replace("/battle");
        router.refresh();
      }
    } catch (err: any) {
      setError(err?.message || "注册失败");
    } finally {
      setLoading(false);
    }
  }

  if (registrationSuccess) {
    return (
      <main className="min-h-screen bg-background px-4 py-16 text-foreground">
        <div className="mx-auto w-full max-w-md">
          <Card>
            {/* 邮件图标 */}
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-interactive-accent/20 flex items-center justify-center">
                <svg className="h-8 w-8 text-interactive-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>

            <h1 className="text-xl font-semibold text-center">注册成功！</h1>
            <p className="mt-2 text-sm text-muted text-center">验证邮件已发送至</p>
            <p className="mt-1 text-sm font-medium text-primary text-center break-all">{registeredEmail}</p>

            {/* 验证步骤 */}
            <div className="mt-6 p-4 rounded-lg bg-surface-secondary border border-border-faint">
              <h2 className="text-sm font-medium mb-3">请按以下步骤完成验证：</h2>
              <ol className="text-sm text-muted space-y-2 list-decimal list-inside">
                <li>打开您的邮箱</li>
                <li>找到来自我们的验证邮件</li>
                <li>点击邮件中的验证链接</li>
                <li>验证完成后即可登录</li>
              </ol>
            </div>

            <p className="mt-4 text-xs text-muted text-center">没有收到邮件？请检查垃圾邮件文件夹</p>

            {/* 操作按钮 */}
            <div className="mt-6 space-y-3">
              <Button type="button" className="w-full" onClick={() => router.push("/login")}>
                前往登录
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => {
                setRegistrationSuccess(false);
                setEmail("");
                setPassword("");
                setCaptchaToken("");
              }}>
                使用其他邮箱注册
              </Button>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <h1 className="text-xl font-semibold">注册</h1>
          <p className="mt-1 text-sm text-muted">
            仅允许域名：{allowed.join(", ")}
          </p>

          <div className="mt-6">
            <GoogleLoginButton />
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-card px-2 text-muted">或</span>
            </div>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
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
