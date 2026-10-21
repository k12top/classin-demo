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
import { newRecordingStopControl, recordingStopControl } from "@/lib/classroom/recording-stop-state";

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
  // Never let an old task's callback mutate the newest task sharing its channel.
  const recording = sid ? await prisma.classroomRecording.findFirst({
    where: { provider: "agora", providerSessionId: sid },
  }) : null;
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomProviderEvent" WHERE "id" = ${providerEvent!.id} FOR UPDATE`;
    const event = await tx.classroomProviderEvent.findUnique({ where: { id: providerEvent!.id } });
    if (event?.processedAt) return;
    if (recording) {
      await tx.$queryRaw`SELECT "id" FROM "ClassroomRecording" WHERE "id" = ${recording.id} FOR UPDATE`;
      const current = await tx.classroomRecording.findUniqueOrThrow({ where: { id: recording.id } });
      const files = deepFiles(payload);
      const playback = selectAgoraRecordingPlayback(files, providerPrefix(current.providerState));
      const disposition = classifyAgoraRecordingWebhook(payload);
      const nextProviderState = appendRecordingProviderState(current.providerState, "lastWebhook", payload);
      const now = new Date();
      // NCS 11 is documented service/task exit. Slice uploads and recorder-component
      // events (31/41/71) do not prove that the entire provider task has exited.
      const exited = eventType === "11";
      const control = recordingStopControl(current.providerState);
      if (exited) nextProviderState.stopControl = { ...(control ?? newRecordingStopControl()),
        confirmedAt: now.toISOString(), confirmation: "provider_exit", nextAction: "query", nextAt: 0,
        leaseId: undefined, leaseUntil: undefined, attention: undefined };
      const confirmedAt = exited ? now : control?.confirmedAt ? new Date(control.confirmedAt) : null;
      const objectKey = playback.objectKey || current.playbackObjectKey;
      await tx.classroomRecording.update({ where: { id: current.id }, data: {
        status: confirmedAt ? objectKey ? "completed" : "processing"
          : disposition === "started" && current.status === "starting" && !(current.mode === "web" && !current.startedAt)
            ? "recording" : current.status,
        ...(files.length ? { files: inputJson(files) } : {}),
        ...(playback.objectKey ? { playbackObjectKey: playback.objectKey, playbackFormat: playback.format } : {}),
        ...(confirmedAt ? { stoppedAt: confirmedAt, failureStage: null, errorMessage: null } : {}),
        providerState: inputJson(nextProviderState),
        ...(disposition === "started" && !current.startedAt && current.mode !== "web" ? { startedAt: now } : {}),
        ...(disposition === "failed" ? { errorMessage: agoraRecordingWebhookLabel(payload).slice(0, 1000) } : {}),
      } });
    }
    await tx.classroomProviderEvent.update({ where: { id: providerEvent!.id },
      data: { ...(recording ? { recordingId: recording.id } : {}), processedAt: new Date() } });
  });

  return NextResponse.json({ ok: true, matched: Boolean(recording) });
}
