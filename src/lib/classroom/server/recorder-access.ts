import "server-only";

import { prisma } from "@/lib/db";
import { verifyRecorderToken } from "./recorder-token";

/** Recorder credentials grant read access only to their signed recording. */
export async function resolveRecorderAccess(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const body = input as { sessionId?: unknown; recordingId?: unknown; recorderToken?: unknown };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const recordingId = typeof body.recordingId === "string" ? body.recordingId : "";
  const token = typeof body.recorderToken === "string" ? body.recorderToken : "";
  if (!sessionId || !recordingId || !await verifyRecorderToken(token, sessionId, recordingId)) return null;
  return prisma.classroomRecording.findFirst({
    where: { id: recordingId, sessionId, mode: "web" },
    select: {
      id: true, courseId: true, sessionId: true,
      status: true, mode: true, fallbackFrom: true,
    },
  });
}
