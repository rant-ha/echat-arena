"use client";

import Link from "next/link";
import { useI18n } from "@/utils/i18n-context";

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="text-center">
        <p className="text-8xl font-bold text-interactive-accent">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-text-primary">
          {t("notfound.title")}
        </h1>
        <p className="mt-2 text-text-muted">
          {t("notfound.message")}
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/battle"
            className="rounded-lg bg-interactive-accent px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-interactive-hover"
          >
            {t("notfound.go_home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
