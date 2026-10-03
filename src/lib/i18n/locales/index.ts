import { zhCN } from "./zh-CN";
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

export const locales = {
  "zh-CN": zhCN,
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
};

export type SupportedLocale = keyof typeof locales;

export const languageOptions = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "th", label: "ไทย" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "fil", label: "Filipino" },
  { value: "ms", label: "Bahasa Melayu" },
  { value: "lo", label: "ລາວ" },
  { value: "my", label: "မြန်မာ" },
  { value: "km", label: "ខ្មែរ" },
  { value: "ta", label: "தமிழ்" },
  { value: "sw", label: "Kiswahili" },
  { value: "fr", label: "Français" },
  { value: "ru", label: "Русский" },
];

export function getTranslation(
  dict: any,
  key: string,
  replacements?: Record<string, string | number>
): string {
  const parts = key.split(".");
  let current = dict;
  for (const part of parts) {
    if (current === undefined || current === null) return key;
    current = current[part];
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
