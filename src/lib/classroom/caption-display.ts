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

/** Recent utterances in speech order, including earlier sentences from the same speaker. */
export function selectLiveCaptions(
  captions: readonly ClassroomCaptionSnapshot[],
  language: string,
  displayMode: CaptionDisplayMode,
  now: number,
  maxAgeMs = 12_000,
  translationReceivedAt: ReadonlyMap<string, number> = new Map(),
) {
  if (displayMode === "off") return [];
  const displayTime = (caption: ClassroomCaptionSnapshot) => Math.max(
    Date.parse(caption.occurredAt),
    displayMode === "original" ? 0 : translationReceivedAt.get(caption.id) ?? 0,
  );
  return captions
    .filter(caption => now - displayTime(caption) <= maxAgeMs &&
      (displayMode === "translated" ? Boolean(captionTranslation(caption, language)) : Boolean(caption.text.trim())))
    // A newly delivered translation gets reading time even after newer speech arrived.
    .sort((a, b) => displayTime(b) - displayTime(a) || Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 3)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}

export function observeCaptionTranslations(
  captions: readonly ClassroomCaptionSnapshot[],
  previousCaptions: readonly ClassroomCaptionSnapshot[],
  language: string,
  previousReceivedAt: ReadonlyMap<string, number>,
  now: number,
) {
  const previousById = new Map(previousCaptions.map(caption => [caption.id, caption]));
  const receivedAt = new Map<string, number>();
  // Several deliveries can share the UI clock's one-second tick. Keep receipt
  // ordering monotonic so a late translation still earns a visible row.
  const receiptTime = Math.max(now, ...previousReceivedAt.values(), ...captions.map(caption => Date.parse(caption.occurredAt))) + 1;
  for (const caption of captions) {
    const translation = captionTranslation(caption, language);
    if (!translation) continue;
    const previous = previousById.get(caption.id);
    const changed = previousCaptions.length > 0 && (!previous || captionTranslation(previous, language) !== translation);
    // Initial history is a baseline, not a batch of newly delivered translations.
    receivedAt.set(caption.id, changed ? receiptTime : previousReceivedAt.get(caption.id) ?? Date.parse(caption.occurredAt));
  }
  return receivedAt;
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
      (previous.isFinal === caption.isFinal && (
        previous.updatedAt && !caption.updatedAt ? true
          : caption.updatedAt && !previous.updatedAt ? false
          : Date.parse(previous.updatedAt || previous.createdAt) > Date.parse(caption.updatedAt || caption.createdAt)
      ));
    const preferred = preferPrevious ? previous : caption;
    captions.set(caption.id, {
      ...preferred,
      occurredAt: previous.occurredAt,
      text: preferred.text || previous.text || caption.text,
      translations: previous.text && caption.text && previous.text !== caption.text
        ? preferred.translations
        : preferPrevious
          ? { ...caption.translations, ...previous.translations }
          : { ...previous.translations, ...caption.translations },
      isFinal: previous.isFinal || caption.isFinal,
    });
  }
  return Array.from(captions.values()).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)).slice(-120);
}
