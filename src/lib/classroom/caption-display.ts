import type { ClassroomCaptionSnapshot } from "@/lib/classroom/types";

export type CaptionDisplayMode =
  | "off"
  | "original"
  | "bilingual"
  | "translated";

export function captionTranslation(
  caption: Pick<ClassroomCaptionSnapshot, "translations">,
  language: string,
) {
  const normalizedLanguage = language.trim();
  if (!normalizedLanguage) return "";
  const exact = caption.translations[normalizedLanguage]?.trim();
  if (exact) return exact;
  const prefix = normalizedLanguage.split("-")[0].toLowerCase();
  return (
    Object.entries(caption.translations).find(
      ([code, text]) =>
        code.split("-")[0].toLowerCase() === prefix && text.trim(),
    )?.[1]?.trim() || ""
  );
}

/**
 * Keep the stage overlay on the newest complete sentence. Incremental
 * captions remain visible in the history panel, while translated modes wait
 * for the corresponding translation instead of flashing an untranslated
 * sentence and immediately replacing it.
 */
export function selectStableCaption(
  captions: readonly ClassroomCaptionSnapshot[],
  language: string,
  displayMode: CaptionDisplayMode,
) {
  if (displayMode === "off") return null;
  for (let index = captions.length - 1; index >= 0; index -= 1) {
    const caption = captions[index];
    if (!caption?.isFinal || !caption.text.trim()) continue;
    if (
      displayMode === "original" ||
      captionTranslation(caption, language)
    ) {
      return caption;
    }
  }
  return null;
}
