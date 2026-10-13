import { classroomLanguageForLocale } from "@/lib/classroom/languages";

export const CAPTION_LANGUAGE_STORAGE_KEY = "classroom_caption_language";
export type CaptionDisplayMode = "off" | "original" | "bilingual" | "translated";

export function initialCaptionLanguage(
  storedLanguage: string | null | undefined,
  interfaceLocale: string,
): string {
  const stored = storedLanguage?.trim();
  return stored || classroomLanguageForLocale(interfaceLocale);
}

export function effectiveCaptionLanguage(
  preferredLanguage: string,
  supportedLanguages: readonly string[],
  fallbackLanguage?: string,
): string {
  if (
    supportedLanguages.length > 0 &&
    !supportedLanguages.includes(preferredLanguage)
  ) {
    return fallbackLanguage && supportedLanguages.includes(fallbackLanguage) ? fallbackLanguage : supportedLanguages[0];
  }
  return preferredLanguage;
}
