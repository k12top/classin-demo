import type { ClassroomCaptionInput } from "./types";

/** One sentence arrives as partials, a final, and potentially late translations. */
export function mergeCaptionInput(previous: ClassroomCaptionInput, incoming: ClassroomCaptionInput): ClassroomCaptionInput {
  const latePartial = previous.isFinal && !incoming.isFinal;
  const changedText = Boolean(incoming.text && previous.text !== incoming.text);
  const preferred = latePartial ? previous : incoming;
  return {
    ...previous, ...preferred,
    text: preferred.text || previous.text,
    speakerName: preferred.speakerName || previous.speakerName,
    sourceLanguage: preferred.sourceLanguage || previous.sourceLanguage,
    detectedLanguage: preferred.detectedLanguage || previous.detectedLanguage,
    occurredAt: previous.occurredAt,
    isFinal: previous.isFinal || incoming.isFinal,
    translations: latePartial && changedText ? previous.translations
      : previous.isFinal && incoming.isFinal && changedText ? incoming.translations
        : { ...previous.translations, ...incoming.translations },
  };
}
