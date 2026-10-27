import type { CaptionDisplayMode } from "./caption-preferences";
import { normalizeClassroomLanguage, normalizeTargetLanguages } from './languages';
import { supportsCaptionTranslation } from './translation-capabilities';
import { isCaptionLanguageCode } from './caption-routing';

export type CaptionStartPreferences = {
  autoCaptions: boolean;
  autoInterpretation: boolean;
  sourceLanguage: string;
  targetLanguages: string[];
};

/** Missing preferences preserve legacy automatic recognition and per-person demand. */
export function captionStartPreferences(value: unknown): CaptionStartPreferences {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const sourceLanguage = normalizeClassroomLanguage(input.sourceLanguage);
  return {
    autoCaptions: typeof input.autoCaptions === 'boolean' ? input.autoCaptions : true,
    autoInterpretation: typeof input.autoInterpretation === 'boolean' ? input.autoInterpretation : true,
    sourceLanguage,
    targetLanguages: normalizeTargetLanguages(input.targetLanguages, sourceLanguage, 10),
  };
}

export function newCaptionStartPreferences(): CaptionStartPreferences {
  return { ...captionStartPreferences(null), targetLanguages: ['en-US'] };
}

export function validateCaptionStartPreferences(value: unknown): CaptionStartPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid caption start settings');
  const input = value as Record<string, unknown>;
  if (typeof input.autoCaptions !== 'boolean' || typeof input.autoInterpretation !== 'boolean' ||
      typeof input.sourceLanguage !== 'string' || !supportsCaptionTranslation('shengwang', input.sourceLanguage) ||
      !Array.isArray(input.targetLanguages) || input.targetLanguages.length > 10 ||
      input.targetLanguages.some(code => typeof code !== 'string' || !isCaptionLanguageCode(code) || !supportsCaptionTranslation('shengwang', code))) {
    throw new Error('Invalid caption start settings');
  }
  const result = captionStartPreferences(value);
  if (result.autoInterpretation && result.targetLanguages.length === 0) throw new Error('Choose at least one interpretation language');
  return result;
}

export function automaticCaptionServiceEnabled(value: unknown): boolean {
  const preferences = captionStartPreferences(value);
  return preferences.autoCaptions || preferences.autoInterpretation;
}

/** Apply classroom defaults only where this account has no valid saved choice. */
export function initialCaptionStartView(preferences: CaptionStartPreferences, saved: unknown): {
  displayMode: CaptionDisplayMode; preferredLanguage: string; overlayVisible: boolean;
} {
  const personal = saved && typeof saved === "object" && !Array.isArray(saved) ? saved as Record<string, unknown> : {};
  const modes: readonly unknown[] = ["off", "original", "bilingual", "translated"];
  return {
    displayMode: modes.includes(personal.displayMode) ? personal.displayMode as CaptionDisplayMode : preferences.autoInterpretation ? "bilingual" : preferences.autoCaptions ? "original" : "off",
    preferredLanguage: typeof personal.preferredLanguage === "string" && isCaptionLanguageCode(personal.preferredLanguage) ? personal.preferredLanguage : preferences.targetLanguages[0] || preferences.sourceLanguage,
    overlayVisible: typeof personal.overlayVisible === "boolean" ? personal.overlayVisible : preferences.autoCaptions,
  };
}
