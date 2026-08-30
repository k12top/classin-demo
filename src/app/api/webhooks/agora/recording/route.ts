import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  agoraRecordingWebhookLabel,
  agoraWebhookDeepValue,
  agoraWebhookNoticeId,
  classifyAgoraRecordingWebhook,
  verifyAgoraWebhookSignature,
} from "@/lib/classroom/agora-webhook";
import { selectAgoraRecordingPlayback } from "@/lib/classroom/providers/agora/server";
import { appendRecordingProviderState } from "@/lib/classroom/recording-provider-state";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function deepFiles(value: unknown): unknown[] {
  const found = agoraWebhookDeepValue(value, ["fileList", "files"]);
  return Array.isArray(found) ? found : [];
}

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function providerPrefix(providerState: unknown): string[] {
  const state = recordValue(providerState);
  return Array.isArray(state?.fileNamePrefix)
    ? state.fileNamePrefix.filter(
        (segment): segment is string => typeof segment === "string",
      )
    : [];
}

export async function POST(request: NextRequest) {
  const secret = process.env.AGORA_RECORDING_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Recording webhook is not configured" },
      { status: 503 },
    );
  }
  const rawBody = await request.text();
  const signature = request.headers.get("agora-signature-v2") || "";
  if (!verifyAgoraWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const noticeId = agoraWebhookNoticeId(payload, rawBody);
  const eventType = textValue(
    payload.eventType || payload.event_type || payload.type,
  );
  let providerEvent = await prisma.classroomProviderEvent.findUnique({
    where: { noticeId },
  });
  if (!providerEvent) {
    try {
      providerEvent = await prisma.classroomProviderEvent.create({
        data: {
          noticeId,
          provider: "agora",
          category: eventType || "recording",
          payload: inputJson(payload),
        },
      });
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      if (code !== "P2002") throw error;
      providerEvent = await prisma.classroomProviderEvent.findUniqueOrThrow({
        where: { noticeId },
      });
    }
  }
  if (providerEvent.processedAt) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const sid = textValue(
    agoraWebhookDeepValue(payload, ["sid", "recordingSid", "providerSessionId"]),
  );
  const channelName = textValue(
    agoraWebhookDeepValue(payload, ["cname", "channelName", "channel"]),
  );
  const identities = [
    ...(sid ? [{ providerSessionId: sid }] : []),
    ...(channelName ? [{ channelName }] : []),
  ];
  const recording = identities.length
    ? await prisma.classroomRecording.findFirst({
        where: {
          provider: "agora",
          OR: identities,
        },
        orderBy: { createdAt: "desc" },
      })
    : null;

  if (recording) {
    const files = deepFiles(payload);
    const playback = selectAgoraRecordingPlayback(
      files,
      providerPrefix(recording.providerState),
    );
    const disposition = classifyAgoraRecordingWebhook(payload);
    const eventLabel = agoraRecordingWebhookLabel(payload);
    const nextProviderState = appendRecordingProviderState(
      recording.providerState,
      "lastWebhook",
      payload,
    );
    const failed = disposition === "failed" && recording.status !== "completed";
    await prisma.classroomRecording.update({
      where: { id: recording.id },
      data: failed
        ? {
            status: "failed",
            failureStage: "webhook",
            errorMessage: eventLabel.slice(0, 1000),
            providerState: inputJson(nextProviderState),
            lastProviderCheckAt: new Date(),
          }
        : {
            status: playback.objectKey
              ? "completed"
              : disposition === "processing"
                ? "processing"
                : disposition === "started" && recording.status === "starting"
                  ? "recording"
                  : recording.status,
            ...(files.length ? { files: inputJson(files) } : {}),
            ...(playback.objectKey
              ? {
                  playbackObjectKey: playback.objectKey,
                  playbackFormat: playback.format,
                  stoppedAt: recording.stoppedAt || new Date(),
                }
              : {}),
            providerState: inputJson(nextProviderState),
            lastProviderCheckAt: new Date(),
            ...(disposition === "started" && !recording.startedAt
              ? { startedAt: new Date() }
              : {}),
            errorMessage: null,
            failureStage: null,
          },
    });
    await prisma.classroomProviderEvent.update({
      where: { id: providerEvent.id },
      data: { recordingId: recording.id, processedAt: new Date() },
    });
  } else {
    await prisma.classroomProviderEvent.update({
      where: { id: providerEvent.id },
      data: { processedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true, matched: Boolean(recording) });
}
