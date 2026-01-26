"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function ErrorContent() {
  const searchParams = useSearchParams();
  const message = searchParams.get("message") || "验证失败";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--main-bg)] p-4">
      <div className="max-w-md w-full rounded-2xl bg-surface-secondary p-8 text-center border border-border-faint">
        {/* Error Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-negative/10">
          <svg
            className="h-8 w-8 text-negative"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>

        <h1 className="mb-2 text-xl font-semibold text-text-primary">
          验证失败
        </h1>
        <p className="mb-6 text-text-muted">{message}</p>

        <div className="space-y-3">
          <Link
            href="/register"
            className="block w-full rounded-lg bg-interactive-accent py-2.5 px-4 font-medium text-white hover:bg-interactive-accent/90 transition"
          >
            重新注册
          </Link>
          <Link
            href="/"
            className="block w-full rounded-lg border border-border-faint py-2.5 px-4 font-medium text-text-secondary hover:bg-surface-elevated transition"
          >
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--main-bg)]">
          <div className="text-text-muted">加载中...</div>
        </div>
      }
    >
      <ErrorContent />
    </Suspense>
  );
}
