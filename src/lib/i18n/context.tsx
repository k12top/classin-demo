"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { getSiteName } from "@/lib/site-brand";
import { locales, SupportedLocale, getTranslation } from "./locales";

const SYNC_CHANNEL_NAME = "matrix_sync_channel";
const ALLOWED_ORIGINS = [
  "https://openmaic.org",
  "https://xiangyuwenshu.cn",
  "https://rainlib.cn",
  "http://localhost:3000",
  "http://localhost:3002",
];

function isOriginAllowed(origin: string): boolean {
  if (typeof window === "undefined") return false;
  if (origin === window.location.origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Support local development ports
  if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return true;

  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    if (hostname === "xiangyuwenshu.cn" || hostname.endsWith(".xiangyuwenshu.cn")) return true;
    if (hostname === "rainlib.cn" || hostname.endsWith(".rainlib.cn")) return true;
  } catch {
    return false;
  }
  return false;
}

function mapToSupportedLocale(lang: string): SupportedLocale | null {
  if (lang in locales) return lang as SupportedLocale;
  const prefix = lang.split("-")[0];
  if (prefix in locales) return prefix as SupportedLocale;
  if (prefix === "zh") return "zh-CN";
  return null;
}

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

  let domainAttribute = "";
  const hostname = window.location.hostname;
  const isSharedDomain = hostname.endsWith("xiangyuwenshu.cn") || hostname.endsWith("rainlib.cn");
  if (hostname.endsWith("xiangyuwenshu.cn")) {
    domainAttribute = "; domain=.xiangyuwenshu.cn";
  } else if (hostname.endsWith("rainlib.cn")) {
    domainAttribute = "; domain=.rainlib.cn";
  }

  if (isSharedDomain) {
    // Clear any host-only cookie on the current subdomain to avoid shadowing
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }

  document.cookie = `${name}=${value}${expires}; path=/${domainAttribute}; SameSite=Lax`;
}

function detectDefaultLocale(): SupportedLocale {
  if (typeof window === "undefined") return "en";

  // 0. URL lang parameter (highest priority, for iframe embed scenarios)
  const urlLang = new URLSearchParams(window.location.search).get("lang");
  if (urlLang) {
    // Direct match (e.g. "en", "zh-CN")
    if (urlLang in locales) return urlLang as SupportedLocale;
    // Prefix fallback (e.g. "zh" -> "zh-CN")
    if (urlLang === "zh") return "zh-CN";
  }

  // 1. Cookie
  const cookieVal = getCookie("NEXT_LOCALE");
  if (cookieVal && cookieVal in locales) return cookieVal as SupportedLocale;

  // 2. LocalStorage
  const saved = localStorage.getItem("locale");
  if (saved && saved in locales) return saved as SupportedLocale;

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

  return "en";
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

  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  // Helper to apply locale state & browser storage/cookies without broadcasting
  const applyLocale = (newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
    localStorage.setItem("locale", newLocale);
    setCookie("NEXT_LOCALE", newLocale, 365);
    if (typeof document !== "undefined") {
      document.documentElement.lang = newLocale;
    }
  };

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    if (!(newLocale in locales)) return;
    if (newLocale === locale) return;

    // 1. Apply locale locally
    applyLocale(newLocale);

    // 2. Same-origin Broadcast
    try {
      const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      channel.postMessage({ type: "LANG_CHANGED", value: newLocale });
      channel.close();
    } catch (e) {
      console.warn("BroadcastChannel postMessage failed", e);
    }

    // 3. Post to parent window (if we are embedded)
    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "LANG_CHANGED", value: newLocale }, "*");
    }

    // 4. Post to all child iframes
    if (typeof document !== "undefined") {
      const iframes = document.getElementsByTagName("iframe");
      for (let i = 0; i < iframes.length; i++) {
        const iframe = iframes[i];
        if (iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: "LANG_CHANGED", value: newLocale }, "*");
        }
      }
    }
  }, [locale]);

  // Sync html lang attribute on mount or change
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  // Setup message listeners and initial handshake
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Clear any host-only NEXT_LOCALE cookie on mount if we are on a shared domain
    // to ensure we read the wildcard cookie correctly.
    const hostname = window.location.hostname;
    const isSharedDomain = hostname.endsWith("xiangyuwenshu.cn") || hostname.endsWith("rainlib.cn");
    if (isSharedDomain) {
      document.cookie = "NEXT_LOCALE=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }

    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;

      // Handle LANG_CHANGED event from parent or iframe
      if (event.data.type === "LANG_CHANGED") {
        if (!isOriginAllowed(event.origin)) {
          console.warn("Blocked unauthorized postMessage from origin:", event.origin);
          return;
        }
        const mappedLang = mapToSupportedLocale(event.data.value);
        if (mappedLang && mappedLang !== localeRef.current) {
          applyLocale(mappedLang);
        }
      }

      // Handle REQUEST_LANG request (as a parent responding to child iframe handshake)
      if (event.data.type === "REQUEST_LANG") {
        const source = event.source as Window;
        if (source) {
          source.postMessage(
            { type: "LANG_CHANGED", value: localeRef.current },
            event.origin === "null" ? "*" : event.origin
          );
        }
      }
    };

    window.addEventListener("message", handleMessage);

    // Setup BroadcastChannel listener (for same-origin tab/iframe sync)
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data && event.data.type === "LANG_CHANGED") {
          const mappedLang = mapToSupportedLocale(event.data.value);
          if (mappedLang && mappedLang !== localeRef.current) {
            applyLocale(mappedLang);
          }
        }
      };
    } catch (e) {
      console.warn("BroadcastChannel same-origin listening not supported", e);
    }

    // Initiate handshake with parent window (if we are embedded in an iframe)
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "REQUEST_LANG" }, "*");
    }

    const syncFromCookie = () => {
      const cookieVal = getCookie("NEXT_LOCALE");
      if (cookieVal && cookieVal in locales && cookieVal !== localeRef.current) {
        applyLocale(cookieVal as SupportedLocale);
      }
    };

    window.addEventListener("focus", syncFromCookie);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncFromCookie();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("focus", syncFromCookie);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (channel) {
        channel.close();
      }
    };
  }, []);

  const value = useMemo(() => {
    const dict = locales[locale] || locales["en"];
    const fallbackDict = locales["en"];

    const t = (key: string, replacements?: Record<string, string | number>) => {
      // Try current language translation
      let translated = getTranslation(dict, key, replacements);
      // Fallback to key if not translated or translates to the key itself
      if (translated === key) {
        translated = getTranslation(fallbackDict, key, replacements);
      }
      if (key === "common.appName") {
        return getSiteName(translated);
      }
      return translated;
    };

    return {
      locale,
      setLocale,
      t,
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
}
