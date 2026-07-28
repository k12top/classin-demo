import "server-only";

import type { ClassroomCaptionInput } from "@/lib/classroom/types";

const REQUEST_TIMEOUT_MS = 12_000;

type WordlyRoomInput = {
  courseId: string;
  title: string;
  channelName: string;
  sourceLanguage: string;
  targetLanguages: string[];
};

function configuration() {
  return {
    baseUrl: (process.env.WORDLY_API_URL || "").trim().replace(/\/+$/, ""),
    token: (process.env.WORDLY_INTERNAL_TOKEN || "").trim(),
  };
}

export function isWordlyConfigured() {
  const config = configuration();
  return Boolean(config.baseUrl && config.token);
}

async function requestWordly<T>(path: string, body: unknown): Promise<T> {
  const config = configuration();
  if (!config.baseUrl || !config.token) {
    throw new Error("Wordly translation is not configured");
  }
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Wordly HTTP ${response.status}: ${text.trim()}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export async function ensureWordlyRoom(input: WordlyRoomInput) {
  await requestWordly("/api/v1/bridge/rooms", {
    roomId: input.courseId,
    title: input.title,
    sourceLang: input.sourceLanguage,
    targetLangs: input.targetLanguages,
    externalProvider: "xiangyu-classroom",
    externalRoomId: input.channelName,
  });
}

export async function translateCaptionWithWordly(
  courseId: string,
  caption: ClassroomCaptionInput,
): Promise<ClassroomCaptionInput> {
  return requestWordly<ClassroomCaptionInput>(
    `/api/v1/bridge/rooms/${encodeURIComponent(courseId)}/transcripts`,
    {
      id: caption.id,
      text: caption.text,
      sourceLang: caption.sourceLanguage,
      detectedLang: caption.detectedLanguage,
      translations: caption.translations,
      isFinal: caption.isFinal,
      speakerId: caption.speakerId,
      speakerLabel: caption.speakerName || "",
      provider: "shengwang",
    },
  );
}

export async function stopWordlyRoom(courseId: string) {
  if (!isWordlyConfigured()) return;
  await requestWordly(
    `/api/v1/bridge/rooms/${encodeURIComponent(courseId)}/control`,
    { action: "stop" },
  );
}
