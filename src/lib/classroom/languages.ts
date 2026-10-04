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
];

const languageCodes = new Set(classroomLanguages.map((language) => language.code));

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
        .filter((item) => languageCodes.has(item) && item !== sourceLanguage),
    ),
  ).slice(0, maxTargets);
}

export function classroomLanguageLabel(code: string): string {
  const language = classroomLanguages.find((item) => item.code === code);
  return language?.nativeLabel || code;
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
