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
  const decoded = decodeProtobuf(payload) || decodeJson(payload);
  if (!decoded) return null;
  const transcript = recordValue(decoded.transcript);
  const translation = recordValue(decoded.translation);
  const raw = translation || transcript || decoded;
  const original = recordValue(
    raw.originalTranscript || raw.original_transcript,
  );
  const words = arrayValue(original?.words).length
    ? arrayValue(original?.words)
    : arrayValue(raw.words);
  const text =
    wordsToText(words) ||
    stringValue(original?.text) ||
    stringValue(raw.text || raw.transcript);
  const translations = translationsFrom(raw);
  if (!text && !Object.keys(translations).length) return null;
  const speakerId = longString(raw.uid || raw.userId || raw.speakerId);
  const occurredAtMs = timestampMillis(
    raw.textTs || raw.text_ts || raw.time || raw.timestamp,
  );
  const sequence = longString(
    raw.sentenceId ||
      raw.sentence_id ||
      raw.textTs ||
      raw.text_ts ||
      raw.offset ||
      raw.time,
  );
  const sourceLanguage = stringValue(
    raw.culture ||
      raw.language ||
      original?.culture ||
      original?.language ||
      raw.sourceLanguage ||
      raw.source_language,
  );
  const flags = [
    raw,
    ...(original ? [original] : []),
    ...words,
    ...arrayValue(raw.trans),
    ...translationResults(raw),
  ]
    .map((item) => {
      const record = recordValue(item);
      return record?.isFinal ?? record?.is_final;
    })
    .filter((value): value is boolean => typeof value === "boolean");
  return {
    // sentence_id is shared by the transcribe and translate deliveries. Do
    // not include data_type here or the two halves can never upsert together.
    id: ["stt", sequence || String(occurredAtMs), speakerId]
      .filter(Boolean)
      .join("_"),
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
  for (const item of translationResults(raw)) {
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

function translationResults(raw: Record<string, unknown>) {
  const results = [...arrayValue(raw.results)];
  for (const [key, value] of Object.entries(raw)) {
    if (/^results?\d+$/i.test(key)) {
      if (Array.isArray(value)) results.push(...value);
      else if (recordValue(value)) results.push(value);
    }
  }
  return results;
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
