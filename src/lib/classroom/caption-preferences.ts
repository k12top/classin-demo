import { classroomLanguageForLocale } from "@/lib/classroom/languages";

export const CAPTION_LANGUAGE_STORAGE_KEY = "classroom_caption_language";

export function initialCaptionLanguage(
  storedLanguage: string | null | undefined,
  interfaceLocale: string,
): string {
  const stored = storedLanguage?.trim();
  return stored || classroomLanguageForLocale(interfaceLocale);
}

export function effectiveCaptionLanguage(
  preferredLanguage: string,
  availableLanguages: readonly string[],
): string {
  if (
    availableLanguages.length > 0 &&
    !availableLanguages.includes(preferredLanguage)
  ) {
    return availableLanguages[0];
  }
  return preferredLanguage;
}
