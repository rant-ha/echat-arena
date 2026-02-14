"use client";

import { useEffect } from "react";
import { useI18n } from "@/utils/i18n-context";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-negative/10">
          <svg className="h-8 w-8 text-negative" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary">
          {t("error.title")}
        </h1>
        <p className="mt-2 text-text-muted">
          {t("error.message")}
        </p>
        {error?.digest && (
          <p className="mt-1 text-xs text-text-muted">
            {t("error.id")}: {error.digest}
          </p>
        )}
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="rounded-lg bg-interactive-accent px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-interactive-hover"
          >
            {t("error.retry")}
          </button>
          <a
            href="/battle"
            className="rounded-lg border border-border-faint bg-surface-secondary px-6 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("error.go_home")}
          </a>
        </div>
      </div>
    </div>
  );
}
