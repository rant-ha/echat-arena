"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, Eye, EyeOff } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button, Card, Input, Label, ErrorText } from "@/components/ui";

export default function AdminLoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, error, login } = useAdminAuth();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated === true) {
      router.replace("/admin");
    }
  }, [isAuthenticated, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!password.trim()) {
      setLocalError("请输入管理员密码");
      return;
    }

    setSubmitting(true);
    const success = await login(password);
    setSubmitting(false);

    if (success) {
      router.replace("/admin");
    }
  }

  // Show loading while checking auth
  if (isLoading || isAuthenticated === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-primary">
        <div className="text-text-secondary">验证中...</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-primary px-4">
      <div className="w-full max-w-md">
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-interactive-accent/10">
              <Shield className="h-5 w-5 text-interactive-accent" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-text-primary">管理后台</h1>
              <p className="text-sm text-text-muted">请输入管理员密码</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入管理员密码"
                  autoComplete="current-password"
                  autoFocus
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {(error || localError) && (
              <ErrorText>{localError || error}</ErrorText>
            )}

            <Button
              type="submit"
              disabled={submitting || isLoading}
              className="w-full"
            >
              {submitting ? "登录中..." : "登录"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <a
              href="/"
              className="text-sm text-text-muted hover:text-interactive-accent"
            >
              返回首页
            </a>
          </div>
        </Card>
      </div>
    </main>
  );
}
