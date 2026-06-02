"use client";

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { locales, SupportedLocale, getTranslation } from "./locales";

interface I18nContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const nameEQ = name + "=";
  const ca = document.cookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === " ") c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return;
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = `${name}=${value}${expires}; path=/; SameSite=Lax`;
}

function detectDefaultLocale(): SupportedLocale {
  if (typeof window === "undefined") return "zh-CN";

  // 1. LocalStorage
  const saved = localStorage.getItem("locale");
  if (saved && saved in locales) return saved as SupportedLocale;

  // 2. Cookie
  const cookieVal = getCookie("NEXT_LOCALE");
  if (cookieVal && cookieVal in locales) return cookieVal as SupportedLocale;

  // 3. Browser Navigator Language
  const navLang = navigator.language;
  if (navLang) {
    // Exact match
    if (navLang in locales) return navLang as SupportedLocale;
    // Prefix match (e.g. 'en-US' -> 'en')
    const prefix = navLang.split("-")[0];
    if (prefix in locales) return prefix as SupportedLocale;
    if (prefix === "zh") return "zh-CN";
  }

  return "zh-CN";
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale?: SupportedLocale;
}) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    if (initialLocale && initialLocale in locales) return initialLocale;
    return detectDefaultLocale();
  });

  const setLocale = (newLocale: SupportedLocale) => {
    if (!(newLocale in locales)) return;
    setLocaleState(newLocale);
    localStorage.setItem("locale", newLocale);
    setCookie("NEXT_LOCALE", newLocale, 365);
    if (typeof document !== "undefined") {
      document.documentElement.lang = newLocale;
    }
  };

  // Sync html lang attribute on mount or change
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const value = useMemo(() => {
    const dict = locales[locale] || locales["zh-CN"];
    const fallbackDict = locales["zh-CN"];

    const t = (key: string, replacements?: Record<string, string | number>) => {
      // Try current language translation
      let translated = getTranslation(dict, key, replacements);
      // Fallback to key if not translated or translates to the key itself
      if (translated === key) {
        translated = getTranslation(fallbackDict, key, replacements);
      }
      return translated;
    };

    return {
      locale,
      setLocale,
      t,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
}
