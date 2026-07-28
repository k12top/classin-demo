import * as protobuf from "protobufjs/light";
import type { ClassroomCaptionInput } from "@/lib/classroom/types";

const root = protobuf.Root.fromJSON({
  nested: {
    Agora: {
      nested: {
        SpeechToText: {
          nested: {
            Text: {
              fields: {
                uid: { type: "int64", id: 4 },
                time: { type: "int64", id: 6 },
                words: { rule: "repeated", type: "Word", id: 10 },
                dataType: { type: "string", id: 13 },
                trans: { rule: "repeated", type: "Translation", id: 14 },
                culture: { type: "string", id: 15 },
                textTs: { type: "int64", id: 16 },
                originalTranscript: { type: "OriginalTranscript", id: 18 },
                sentenceId: { type: "int64", id: 19 },
              },
            },
            Word: {
              fields: {
                text: { type: "string", id: 1 },
                isFinal: { type: "bool", id: 4 },
              },
            },
            Translation: {
              fields: {
                isFinal: { type: "bool", id: 1 },
                lang: { type: "string", id: 2 },
                texts: { rule: "repeated", type: "string", id: 3 },
              },
            },
            OriginalTranscript: {
              fields: {
                culture: { type: "string", id: 1 },
                words: { rule: "repeated", type: "Word", id: 2 },
              },
            },
          },
        },
      },
    },
  },
});

const TextMessage = root.lookupType("Agora.SpeechToText.Text");

export function decodeClassroomSttCaption(
  payload: Uint8Array,
): ClassroomCaptionInput | null {
  const raw = decodeProtobuf(payload) || decodeJson(payload);
  if (!raw) return null;
  const original = recordValue(raw.originalTranscript);
  const words = arrayValue(original?.words).length
    ? arrayValue(original?.words)
    : arrayValue(raw.words);
  const text = wordsToText(words) || stringValue(raw.text);
  const translations = translationsFrom(raw);
  if (!text && !Object.keys(translations).length) return null;
  const speakerId = longString(raw.uid || raw.userId || raw.speakerId);
  const occurredAtMs = timestampMillis(raw.textTs || raw.time || raw.timestamp);
  const sequence = longString(raw.sentenceId || raw.textTs || raw.time);
  const sourceLanguage = stringValue(
    raw.culture || original?.culture || raw.sourceLanguage,
  );
  const flags = [
    ...words,
    ...arrayValue(raw.trans),
  ]
    .map((item) => recordValue(item)?.isFinal)
    .filter((value): value is boolean => typeof value === "boolean");
  return {
    id: [
      "stt",
      sequence || String(occurredAtMs),
      speakerId,
      stringValue(raw.dataType) || "text",
    ].filter(Boolean).join("_"),
    text,
    sourceLanguage,
    detectedLanguage: sourceLanguage,
    translations,
    speakerId,
    occurredAt: new Date(occurredAtMs).toISOString(),
    isFinal: flags.length > 0 ? flags.every(Boolean) : false,
  };
}

function decodeProtobuf(payload: Uint8Array): Record<string, unknown> | null {
  try {
    return TextMessage.toObject(TextMessage.decode(payload), {
      longs: String,
      arrays: true,
      objects: true,
    }) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function decodeJson(payload: Uint8Array): Record<string, unknown> | null {
  try {
    const text = new TextDecoder().decode(payload).trim();
    if (!text.startsWith("{")) return null;
    const value = JSON.parse(text);
    return recordValue(value) || null;
  } catch {
    return null;
  }
}

function translationsFrom(raw: Record<string, unknown>) {
  const translations: Record<string, string> = {};
  const direct = recordValue(raw.translations);
  if (direct) {
    for (const [language, text] of Object.entries(direct)) {
      const normalized = stringValue(text);
      if (normalized) translations[language] = normalized;
    }
  }
  for (const item of arrayValue(raw.trans)) {
    const translation = recordValue(item);
    const language = stringValue(
      translation?.lang || translation?.language || translation?.target,
    );
    const text =
      arrayValue(translation?.texts).map(stringValue).filter(Boolean).join("") ||
      stringValue(translation?.text || translation?.content);
    if (language && text) translations[language] = text;
  }
  return translations;
}

function wordsToText(words: unknown[]) {
  return words
    .map((word) => stringValue(recordValue(word)?.text || word))
    .filter(Boolean)
    .join("")
    .trim();
}

function timestampMillis(value: unknown) {
  const number = Number(longString(value));
  if (!Number.isFinite(number) || number <= 0) return Date.now();
  return number < 1_000_000_000_000 ? number * 1000 : number;
}

function longString(value: unknown) {
  if (value == null) return "";
  if (["string", "number", "bigint"].includes(typeof value)) return String(value);
  if (recordValue(value) && typeof value.toString === "function") return value.toString();
  return "";
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
