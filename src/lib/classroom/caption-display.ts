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
  const latest = captions.reduce<ClassroomCaptionSnapshot | null>((current, caption) =>
    !current || Date.parse(caption.occurredAt) >= Date.parse(current.occurredAt) ? caption : current, null);
  if (!latest) return null;
  return displayMode === "translated"
    ? captionTranslation(latest, language) ? latest : null
    : latest.text.trim() ? latest : null;
}

/** One recent utterance per speaker; late translations never resurrect older speech. */
export function selectLiveCaptions(
  captions: readonly ClassroomCaptionSnapshot[],
  language: string,
  displayMode: CaptionDisplayMode,
  now: number,
  maxAgeMs = 12_000,
) {
  if (displayMode === "off") return [];
  const speakers = new Map<string, ClassroomCaptionSnapshot>();
  for (const caption of captions) {
    const previous = speakers.get(caption.speakerId);
    if (!previous || Date.parse(caption.occurredAt) >= Date.parse(previous.occurredAt)) {
      speakers.set(caption.speakerId, caption);
    }
  }
  return Array.from(speakers.values())
    .filter(caption => now - Date.parse(caption.occurredAt) <= maxAgeMs &&
      (displayMode === "translated" ? Boolean(captionTranslation(caption, language)) : Boolean(caption.text.trim())))
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 3)
    .reverse();
}

/** Merge a poll/ack with newer local speech without rolling a final back to a partial. */
export function mergeCaptionSnapshots(
  current: readonly ClassroomCaptionSnapshot[],
  incoming: readonly ClassroomCaptionSnapshot[],
) {
  const captions = new Map(current.map(caption => [caption.id, caption]));
  for (const caption of incoming) {
    const previous = captions.get(caption.id);
    if (!previous) { captions.set(caption.id, caption); continue; }
    const preferPrevious = (previous.isFinal && !caption.isFinal) ||
      (previous.isFinal === caption.isFinal && Date.parse(previous.createdAt) > Date.parse(caption.createdAt));
    const preferred = preferPrevious ? previous : caption;
    captions.set(caption.id, {
      ...preferred,
      occurredAt: previous.occurredAt,
      text: preferred.text || previous.text || caption.text,
      translations: preferPrevious
        ? { ...caption.translations, ...previous.translations }
        : { ...previous.translations, ...caption.translations },
      isFinal: previous.isFinal || caption.isFinal,
    });
  }
  return Array.from(captions.values()).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)).slice(-120);
}
