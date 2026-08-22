import "server-only";

import { createHash } from "node:crypto";
import { RtcRole, RtcTokenBuilder } from "agora-token";
import { classroomRuntimeDefaults } from "@/lib/classroom/config";
import {
  buildAgoraSttJoinPayload,
  buildAgoraSttUpdatePayload,
} from "@/lib/classroom/transcription/agora-stt-payload";
import {
  normalizeAgoraTranscriptionStatus,
  type AgoraTranscriptionStatus,
} from "@/lib/classroom/transcription/agora-stt-status";

export { normalizeAgoraTranscriptionStatus };
export type { AgoraTranscriptionStatus };

const REQUEST_TIMEOUT_MS = 20_000;

export type AgoraTranscriptionInput = {
  courseId: string;
  channelName: string;
  sourceLanguage: string;
  targetLanguages: string[];
  translationProvider: "shengwang" | "wordly";
};

function enabled() {
  return !["0", "false", "off"].includes(
    (process.env.AGORA_STT_ENABLED || "true").trim().toLowerCase(),
  );
}

function configuration() {
  return {
    appId: (process.env.AGORA_APP_ID || "").trim(),
    appCertificate: (process.env.AGORA_APP_CERTIFICATE || "").trim(),
    customerId: (
      process.env.AGORA_REST_CUSTOMER_ID || process.env.SHENGWANG_CUSTOMER_KEY || ""
    ).trim(),
    customerSecret: (
      process.env.AGORA_REST_CUSTOMER_SECRET || process.env.SHENGWANG_CUSTOMER_SECRET || ""
    ).trim(),
    region: (process.env.AGORA_STT_REGION || process.env.SHENGWANG_REGION || "cn").trim(),
    apiBaseUrl: (
      process.env.AGORA_API_BASE_URL ||
      process.env.SHENGWANG_API_BASE_URL ||
      "https://api.sd-rtn.com"
    ).trim().replace(/\/+$/, ""),
    maxIdleSeconds: Math.max(
      60,
      Number(process.env.AGORA_STT_MAX_IDLE_SECONDS || 300) || 300,
    ),
  };
}

export function isAgoraTranscriptionConfigured() {
  const config = configuration();
  return Boolean(
    enabled() &&
      config.appId &&
      config.appCertificate &&
      config.customerId &&
      config.customerSecret,
  );
}

function stableUid(value: string, namespace: string) {
  const digest = createHash("sha256").update(`${namespace}:${value}`).digest();
  return (digest.readUInt32BE(0) % 2_000_000_000) + 1;
}

function botToken(
  appId: string,
  appCertificate: string,
  channelName: string,
  uid: number,
  publisher: boolean,
) {
  return RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    publisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
    classroomRuntimeDefaults.rtcTokenTtlSeconds,
    classroomRuntimeDefaults.rtcTokenTtlSeconds,
  );
}

async function request(
  path: string,
  body?: unknown,
  method: "GET" | "POST" = "POST",
) {
  const config = configuration();
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${config.customerId}:${config.customerSecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  if (!response.ok) {
    const existingAgent =
      typeof data.agent_id === "string"
        ? data.agent_id
        : typeof data.agentId === "string"
          ? data.agentId
          : "";
    if (response.status === 409 && existingAgent) return data;
    throw new Error(
      `Shengwang STT HTTP ${response.status}: ${
        typeof data.reason === "string" ? data.reason : text.trim()
      }`,
    );
  }
  return data;
}

export async function startAgoraTranscription(input: AgoraTranscriptionInput) {
  if (!isAgoraTranscriptionConfigured()) {
    throw new Error("Shengwang ASR is not configured");
  }
  const config = configuration();
  const subscriberUid = stableUid(input.courseId, "stt-subscriber");
  const publisherUid = stableUid(input.courseId, "stt-publisher");
  const payload = buildAgoraSttJoinPayload({
    channelName: input.channelName,
    sourceLanguage: input.sourceLanguage,
    targetLanguages: input.targetLanguages,
    translationProvider: input.translationProvider,
    maxIdleSeconds: config.maxIdleSeconds,
    subscriberUid: String(subscriberUid),
    subscriberToken: botToken(
      config.appId,
      config.appCertificate,
      input.channelName,
      subscriberUid,
      false,
    ),
    publisherUid: String(publisherUid),
    publisherToken: botToken(
      config.appId,
      config.appCertificate,
      input.channelName,
      publisherUid,
      true,
    ),
    taskName: `classroom-${input.courseId}`,
  });
  const result = await request(
    `/${encodeURIComponent(config.region)}/api/speech-to-text/v1/projects/${encodeURIComponent(config.appId)}/join`,
    payload,
  );
  const agentId =
    typeof result.agent_id === "string"
      ? result.agent_id
      : typeof result.taskId === "string"
        ? result.taskId
        : "";
  if (!agentId) throw new Error("Shengwang ASR response is missing agent_id");
  let status = normalizeAgoraTranscriptionStatus(result);
  if (status === "unknown") {
    status = normalizeAgoraTranscriptionStatus(
      await queryAgoraTranscription(agentId),
    );
  }
  if (["failed", "stopped", "stopping"].includes(status)) {
    throw new Error(`Shengwang ASR agent entered ${status} during startup`);
  }
  return {
    agentId,
    publisherUid: String(publisherUid),
    status: status === "unknown" ? "starting" : status,
  };
}

export async function queryAgoraTranscription(agentId: string) {
  if (!agentId || !isAgoraTranscriptionConfigured()) {
    throw new Error("Shengwang ASR is not configured");
  }
  const config = configuration();
  return request(
    `/${encodeURIComponent(config.region)}/api/speech-to-text/v1/projects/${encodeURIComponent(config.appId)}/agents/${encodeURIComponent(agentId)}`,
    undefined,
    "GET",
  );
}

export async function updateAgoraTranscription(
  agentId: string,
  input: Pick<
    AgoraTranscriptionInput,
    "sourceLanguage" | "targetLanguages" | "translationProvider"
  >,
) {
  if (!agentId || !isAgoraTranscriptionConfigured()) {
    throw new Error("Shengwang ASR is not configured");
  }
  const config = configuration();
  const query = new URLSearchParams({
    sequenceId: String(Date.now()),
    updateMask:
      "languages,translateConfig.enable,translateConfig.languages",
  });
  return request(
    `/${encodeURIComponent(config.region)}/api/speech-to-text/v1/projects/${encodeURIComponent(config.appId)}/agents/${encodeURIComponent(agentId)}/update?${query.toString()}`,
    buildAgoraSttUpdatePayload(input),
  );
}

export async function stopAgoraTranscription(agentId: string) {
  if (!agentId || !isAgoraTranscriptionConfigured()) return;
  const config = configuration();
  try {
    await request(
      `/${encodeURIComponent(config.region)}/api/speech-to-text/v1/projects/${encodeURIComponent(config.appId)}/agents/${encodeURIComponent(agentId)}/leave`,
      {},
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("HTTP 404")) return;
    throw error;
  }
}
