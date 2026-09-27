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

/** Show live original text as it arrives; translation-only waits silently. */
export function selectStableCaption(
  captions: readonly ClassroomCaptionSnapshot[],
  language: string,
  displayMode: CaptionDisplayMode,
) {
  if (displayMode === "off") return null;
  for (let index = captions.length - 1; index >= 0; index -= 1) {
    const caption = captions[index];
    if (!caption) continue;
    if (displayMode === "translated") {
      if (captionTranslation(caption, language)) return caption;
    } else if (caption.text.trim()) {
      return caption;
    }
  }
  return null;
}
