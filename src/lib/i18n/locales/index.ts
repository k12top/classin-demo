import { zhCN } from "./zh-CN";
import { zhTW } from "./zh-TW";
import { en } from "./en";
import { ja } from "./ja";
import { fr } from "./fr";
import { ru } from "./ru";
import { th } from "./th";
import { vi } from "./vi";
import { id } from "./id";
import { ms } from "./ms";
import { fil } from "./fil";
import { ko } from "./ko";
import { lo } from "./lo";
import { my } from "./my";
import { km } from "./km";
import { ta } from "./ta";
import { sw } from "./sw";
import { es } from "./es";
import { pt } from "./pt";
import { de } from "./de";
import { it } from "./it";
import { ar } from "./ar";
import { hi } from "./hi";

export const locales = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "en": en,
  "ja": ja,
  "fr": fr,
  "ru": ru,
  "th": th,
  "vi": vi,
  "id": id,
  "ms": ms,
  "fil": fil,
  "ko": ko,
  "lo": lo,
  "my": my,
  "km": km,
  "ta": ta,
  "sw": sw,
  "es": es,
  "pt": pt,
  "de": de,
  "it": it,
  "ar": ar,
  "hi": hi,
};

export type SupportedLocale = keyof typeof locales;

export const languageOptions = [
  { value: "zh-CN", label: "简体中文", flag: "🇨🇳", region: "East Asia" },
  { value: "zh-TW", label: "繁體中文", flag: "🇹🇼", region: "East Asia" },
  { value: "en", label: "English", flag: "🇺🇸", region: "Global" },
  { value: "ja", label: "日本語", flag: "🇯🇵", region: "East Asia" },
  { value: "ko", label: "한국어", flag: "🇰🇷", region: "East Asia" },
  { value: "th", label: "ไทย", flag: "🇹🇭", region: "Southeast Asia" },
  { value: "vi", label: "Tiếng Việt", flag: "🇻🇳", region: "Southeast Asia" },
  { value: "id", label: "Bahasa Indonesia", flag: "🇮🇩", region: "Southeast Asia" },
  { value: "ms", label: "Bahasa Melayu", flag: "🇲🇾", region: "Southeast Asia" },
  { value: "fil", label: "Filipino", flag: "🇵🇭", region: "Southeast Asia" },
  { value: "km", label: "ខ្មែរ", flag: "🇰🇭", region: "Southeast Asia" },
  { value: "lo", label: "ລາວ", flag: "🇱🇦", region: "Southeast Asia" },
  { value: "my", label: "မြန်မာ", flag: "🇲🇲", region: "Southeast Asia" },
  { value: "pt", label: "Português", flag: "🇵🇹", region: "Global" },
  { value: "es", label: "Español", flag: "🇪🇸", region: "Global" },
  { value: "fr", label: "Français", flag: "🇫🇷", region: "Europe" },
  { value: "de", label: "Deutsch", flag: "🇩🇪", region: "Europe" },
  { value: "it", label: "Italiano", flag: "🇮🇹", region: "Europe" },
  { value: "ru", label: "Русский", flag: "🇷🇺", region: "Europe" },
  { value: "hi", label: "हिन्दी", flag: "🇮🇳", region: "South Asia" },
  { value: "ta", label: "தமிழ்", flag: "🇮🇳", region: "South Asia" },
  { value: "ar", label: "العربية", flag: "🇸🇦", region: "Middle East" },
  { value: "sw", label: "Kiswahili", flag: "🇰🇪", region: "Africa" },
] satisfies ReadonlyArray<{
  value: SupportedLocale;
  label: string;
  flag: string;
  region: string;
}>;

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return Boolean(value && value in locales);
}

export function normalizeSupportedLocale(
  value: string | null | undefined,
): SupportedLocale | null {
  if (!value) return null;
  if (isSupportedLocale(value)) return value;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "zh-hant" ||
    normalized.startsWith("zh-tw") ||
    normalized.startsWith("zh-hk") ||
    normalized.startsWith("zh-mo")
  ) {
    return "zh-TW";
  }
  if (normalized.startsWith("zh")) return "zh-CN";
  const prefix = normalized.split("-")[0];
  return isSupportedLocale(prefix) ? prefix : null;
}

export function resolveLocalePreference(input: {
  url?: string | null;
  cookie?: string | null;
  storage?: string | null;
  browser?: string | null;
}): SupportedLocale {
  return (
    normalizeSupportedLocale(input.url) ||
    normalizeSupportedLocale(input.cookie) ||
    normalizeSupportedLocale(input.storage) ||
    normalizeSupportedLocale(input.browser) ||
    "en"
  );
}

export function localeDirection(locale: SupportedLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function getTranslation(
  dict: unknown,
  key: string,
  replacements?: Record<string, string | number>
): string {
  const parts = key.split(".");
  let current: unknown = dict;
  for (const part of parts) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current)
    ) {
      return key;
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== "string") {
    // If it's an array (like calendarDays), return a joined string or just key
    if (Array.isArray(current)) {
      return JSON.stringify(current);
    }
    return key;
  }
  let text = current;
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      text = text.replace(new RegExp(`{${k}}`, "g"), String(v));
    }
  }
  return text;
}
