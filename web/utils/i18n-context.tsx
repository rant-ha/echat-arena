"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { Locale } from "./i18n";
import { getTranslation } from "./i18n";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const LOCALE_STORAGE_KEY = "echat-arena-locale";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");

  // Read from localStorage on mount (useEffect to avoid hydration mismatch)
  useEffect(() => {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "zh") {
      setLocaleState(stored);
    }
  }, []);

  // Keep <html lang> in sync with locale
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => getTranslation(locale, key, params),
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const I18N_FALLBACK: I18nContextValue = {
  locale: "zh" as Locale,
  setLocale: () => {},
  t: (key: string, params?: Record<string, string | number>) => getTranslation("zh", key, params),
};

export function useI18n() {
  const ctx = useContext(I18nContext);
  return ctx ?? I18N_FALLBACK;
}
