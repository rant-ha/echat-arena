"use client";

import type React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import TurnstileCaptcha from "@/components/TurnstileCaptcha";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { Button, Card, ErrorText, Input, Label } from "@/components/ui";

export default function LoginClient(props: { nextPath: string; errorCode: string }) {
  const { nextPath, errorCode } = props;
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorCode === "gmail_only" ? "仅允许 Gmail 邮箱通过 Google 登录" : null
  );

  const captchaEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (captchaEnabled && !captchaToken) {
      setError("请先完成验证码校验");
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaEnabled ? { captchaToken } : undefined,
      });
      if (authError) throw authError;

      const redirectTo = nextPath?.startsWith("/") && !nextPath.startsWith("//")
        ? nextPath
        : "/battle";

      router.replace(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "登录失败";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <h1 className="text-xl font-semibold">登录</h1>
          <p className="mt-1 text-sm text-muted">使用邮箱 + 密码登录</p>

          <div className="mt-6">
            {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
              <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}>
                <GoogleLoginButton redirectTo={nextPath} />
              </GoogleOAuthProvider>
            ) : null}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
                required
              />
            </div>

            <div>
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPassword(e.target.value)
                }
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
              {loading ? "登录中..." : "登录"}
            </Button>

            <div className="text-center text-sm text-muted">
              没有账号？{" "}
              <a className="text-primary hover:underline" href="/register">
                去注册
              </a>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
