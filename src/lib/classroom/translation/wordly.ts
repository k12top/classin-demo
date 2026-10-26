import "server-only";

import type { ClassroomCaptionInput } from "@/lib/classroom/types";
import { isCaptionLanguageCode, type BridgeTranslationCapabilities } from "../caption-routing";

const REQUEST_TIMEOUT_MS = 12_000;
const HEALTH_CACHE_MS = 30_000;
let healthCache: { checkedAt: number; healthy: boolean } | null = null;
let capabilitiesCache: { key: string; checkedAt: number; value: BridgeTranslationCapabilities } | null = null;
let capabilitiesRequest: { key: string; promise: Promise<BridgeTranslationCapabilities> } | null = null;

const unavailableCapabilities = (): BridgeTranslationCapabilities => ({ configured: false, targetLanguages: [], maxTargetLanguages: 0 });

/** Match meeting's authenticated bridge discovery, never the public Wordly catalog. */
export async function wordlyTranslationCapabilities(): Promise<BridgeTranslationCapabilities> {
  if (!isWordlyConfigured()) return unavailableCapabilities();
  const config = configuration();
  const key = JSON.stringify([config.baseUrl, config.token]);
  if (capabilitiesCache?.key === key && Date.now() - capabilitiesCache.checkedAt < HEALTH_CACHE_MS) return capabilitiesCache.value;
  if (capabilitiesRequest?.key === key) return capabilitiesRequest.promise;
  const promise = (async () => {
    let value = unavailableCapabilities();
    try {
      const response = await fetch(`${config.baseUrl}/api/v1/bridge/capabilities`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${config.token}` },
        cache: "no-store", signal: AbortSignal.timeout(4_000),
      });
      if (response.ok) {
        const body = await response.json();
        if (body.configured === true && Array.isArray(body.targetLanguages) && Number.isInteger(body.maxTargetLanguages) && body.maxTargetLanguages > 0) {
          value = { configured: true, targetLanguages: [...new Set<string>(body.targetLanguages.filter(isCaptionLanguageCode))], maxTargetLanguages: Math.min(20, body.maxTargetLanguages) };
        }
      }
    } catch { /* Fail closed; a health endpoint alone does not establish language support. */ }
    capabilitiesCache = { key, checkedAt: Date.now(), value };
    return value;
  })();
  capabilitiesRequest = { key, promise };
  try { return await promise; }
  finally { if (capabilitiesRequest?.promise === promise) capabilitiesRequest = null; }
}

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

export async function isWordlyHealthy() {
  if (!isWordlyConfigured()) return false;
  if (
    healthCache &&
    Date.now() - healthCache.checkedAt < HEALTH_CACHE_MS
  ) {
    return healthCache.healthy;
  }
  const config = configuration();
  try {
    const response = await fetch(`${config.baseUrl}/health`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    const healthy = response.ok;
    healthCache = { checkedAt: Date.now(), healthy };
    return healthy;
  } catch {
    healthCache = { checkedAt: Date.now(), healthy: false };
    return false;
  }
}

async function requestWordly<T>(path: string, body: unknown, allowMissingRoom = false): Promise<T> {
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
  if (allowMissingRoom && response.status === 404) return {} as T;
  if (!response.ok) {
    throw new Error(`Wordly HTTP ${response.status}`);
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
      // The bridge skips translation when any translations are supplied.
      // Shengwang may already have produced other tracks in this mixed request.
      translations: {},
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
    true,
  );
}
