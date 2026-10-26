import { shengwangTranslationLanguages, supportedCaptionTranslationCodes, type CaptionTranslationProvider } from "./translation-capabilities";
import { isCaptionLanguageCode } from "./caption-routing";

export type ClassroomLanguage = {
  code: string;
  label: string;
  nativeLabel: string;
  region: "southeast-asia" | "east-asia" | "south-asia" | "global";
};

export const classroomLanguages: ClassroomLanguage[] = [
  { code: "zh-CN", label: "Chinese (Simplified)", nativeLabel: "简体中文", region: "east-asia" },
  { code: "zh-TW", label: "Chinese (Traditional)", nativeLabel: "繁體中文", region: "east-asia" },
  { code: "en-US", label: "English", nativeLabel: "English", region: "global" },
  { code: "th-TH", label: "Thai", nativeLabel: "ไทย", region: "southeast-asia" },
  { code: "vi-VN", label: "Vietnamese", nativeLabel: "Tiếng Việt", region: "southeast-asia" },
  { code: "id-ID", label: "Indonesian", nativeLabel: "Bahasa Indonesia", region: "southeast-asia" },
  { code: "ms-MY", label: "Malay", nativeLabel: "Bahasa Melayu", region: "southeast-asia" },
  { code: "fil-PH", label: "Filipino", nativeLabel: "Filipino", region: "southeast-asia" },
  { code: "km-KH", label: "Khmer", nativeLabel: "ខ្មែរ", region: "southeast-asia" },
  { code: "lo-LA", label: "Lao", nativeLabel: "ລາວ", region: "southeast-asia" },
  { code: "my-MM", label: "Burmese", nativeLabel: "မြန်မာ", region: "southeast-asia" },
  { code: "pt-PT", label: "Portuguese", nativeLabel: "Português", region: "global" },
  { code: "ja-JP", label: "Japanese", nativeLabel: "日本語", region: "east-asia" },
  { code: "ko-KR", label: "Korean", nativeLabel: "한국어", region: "east-asia" },
  { code: "hi-IN", label: "Hindi", nativeLabel: "हिन्दी", region: "south-asia" },
  { code: "ta-IN", label: "Tamil", nativeLabel: "தமிழ்", region: "south-asia" },
  { code: "ar-SA", label: "Arabic", nativeLabel: "العربية", region: "global" },
  { code: "es-ES", label: "Spanish", nativeLabel: "Español", region: "global" },
  { code: "fr-FR", label: "French", nativeLabel: "Français", region: "global" },
  { code: "de-DE", label: "German", nativeLabel: "Deutsch", region: "global" },
  { code: "it-IT", label: "Italian", nativeLabel: "Italiano", region: "global" },
  { code: "ru-RU", label: "Russian", nativeLabel: "Русский", region: "global" },
  { code: "sw-KE", label: "Swahili", nativeLabel: "Kiswahili", region: "global" },
  { code: "am-ET", label: "Amharic (Ethiopia)", nativeLabel: "አማርኛ", region: "global" },
  { code: "bm", label: "Bambara · 班巴拉语", nativeLabel: "Bamanankan", region: "global" },
  { code: "chm", label: "Meadow Mari · 草原马里语", nativeLabel: "Meadow Mari", region: "global" },
];

const languageCodes = new Set([...classroomLanguages.map((language) => language.code), ...shengwangTranslationLanguages.map(language => language.code), ...supportedCaptionTranslationCodes("wordly")]);

/** No translation is billed until a participant requests a language. */
export function defaultClassroomTargetLanguages(_sourceLanguage: string): string[] {
  void _sourceLanguage;
  return [];
}

const captionOptionsCache = new Map<CaptionTranslationProvider, ClassroomLanguage[]>();

export function captionLanguageOptions(provider: CaptionTranslationProvider, codes?: readonly string[]): ClassroomLanguage[] {
  const cached = !codes && captionOptionsCache.get(provider);
  if (cached) return cached;
  const options: ClassroomLanguage[] = [...new Set(codes ?? supportedCaptionTranslationCodes(provider))].map(code => {
    const existing = classroomLanguages.find(language => language.code === code);
    if (existing) return existing;
    const label = shengwangTranslationLanguages.find(language => language.code === code)?.label || code;
    let nativeLabel = label;
    try {
      nativeLabel = new Intl.DisplayNames([code], { type: "language" }).of(code) || label;
    } catch { /* Provider-specific dialect identifiers may not be valid Intl locales. */ }
    return { code, label, nativeLabel, region: "global" };
  });
  if (!codes) captionOptionsCache.set(provider, options);
  return options;
}

export function normalizeClassroomLanguage(value: unknown, fallback = "zh-CN") {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return languageCodes.has(normalized) ? normalized : fallback;
}

export function normalizeTargetLanguages(
  value: unknown,
  sourceLanguage: string,
  maxTargets = 10,
): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => isCaptionLanguageCode(item) && item !== sourceLanguage),
    ),
  ).slice(0, maxTargets);
}

const displayNamesCache = new Map<string, Intl.DisplayNames>();

function languageDisplayName(code: string, locale: string): string | undefined {
  try {
    let names = displayNamesCache.get(locale);
    if (!names) {
      names = new Intl.DisplayNames([locale], { type: "language", fallback: "none" });
      displayNamesCache.set(locale, names);
    }
    return names.of(code);
  } catch {
    // Older browsers and provider dialect identifiers can lack Intl support.
    return undefined;
  }
}

/** Keep each language recognizable in its own script and in the interface locale. */
export function classroomLanguageLabel(code: string, locale?: string): string {
  const language = classroomLanguages.find((item) => item.code === code);
  const nativeLabel = language?.nativeLabel || languageDisplayName(code, code)
    || shengwangTranslationLanguages.find(item => item.code === code)?.label || code;
  const localizedLabel = locale ? languageDisplayName(code, locale) : undefined;
  return localizedLabel && localizedLabel !== nativeLabel
    ? `${nativeLabel} · ${localizedLabel}` : nativeLabel;
}

/** Sort the names people see; retain English, native and localized names for search. */
export function captionLanguageSelectOptions(provider: CaptionTranslationProvider, locale: string, codes?: readonly string[]) {
  const alphabet = new Intl.Collator("en", { sensitivity: "base", numeric: true });
  return captionLanguageOptions(provider, codes).map(language => ({
    value: language.code,
    label: classroomLanguageLabel(language.code, locale),
    searchText: [language.label, language.nativeLabel, languageDisplayName(language.code, locale), languageDisplayName(language.code, "en"), language.code].join(" "),
  })).sort((a, b) => alphabet.compare(a.label, b.label) || alphabet.compare(a.value, b.value));
}

const interfaceLocaleToClassroomLanguage: Record<string, string> = {
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  en: "en-US",
  ja: "ja-JP",
  ko: "ko-KR",
  th: "th-TH",
  vi: "vi-VN",
  id: "id-ID",
  ms: "ms-MY",
  fil: "fil-PH",
  km: "km-KH",
  lo: "lo-LA",
  my: "my-MM",
  pt: "pt-PT",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  ru: "ru-RU",
  hi: "hi-IN",
  ta: "ta-IN",
  ar: "ar-SA",
  sw: "sw-KE",
};

export function classroomLanguageForLocale(locale: string): string {
  const normalized = locale.trim();
  return (
    interfaceLocaleToClassroomLanguage[normalized] ||
    interfaceLocaleToClassroomLanguage[normalized.split("-")[0]] ||
    "en-US"
  );
}
