import { after, NextRequest, NextResponse } from "next/server";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { leaveClassroomConnection, normalizeClassroomClientId } from "@/lib/classroom/server/connections";
import { syncClassroomTranscription, stopClassroomTranscription } from "@/lib/classroom/server/transcription-orchestrator";
import { stopActiveRecordingsForCourse } from "@/lib/classroom/server/recording-orchestrator";
import { deliverClassroomEvents } from "@/lib/classroom/server/integration-events";
import { clearCourseSessionAccessCache } from "@/lib/course-session-access";
import { syncCourseStatusFromSessions } from "@/lib/course-session-status";
import { queueCourseSessionSummary, processCourseSessionSummaryGeneration } from "@/lib/course-session-summary-generation";
import { databaseUnavailableResponse } from "@/lib/database-response";

export const maxDuration = 300;

async function handlePost(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (typeof body?.sessionId !== "string") return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  const clientId = normalizeClassroomClientId(body.clientId);
  if (!clientId) return NextResponse.json({ error: "valid clientId required" }, { status: 400 });
  if (body.leaveIntent !== undefined && body.leaveIntent !== "temporary" && body.leaveIntent !== "finishIfLastTeacher") {
    return NextResponse.json({ error: "Invalid leave intent" }, { status: 400 });
  }
  const explicit = body.voluntary === true && body.leaveIntent !== undefined;
  if (explicit && (typeof body.cycleStartedAt !== "string" || !Number.isFinite(Date.parse(body.cycleStartedAt)))) {
    return NextResponse.json({ error: "Class cycle required for explicit leave" }, { status: 400 });
  }
  const resolved = await resolveClassroomRequestAccess(request, body.sessionId, body.shareAccess);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (explicit && body.leaveIntent === "finishIfLastTeacher" && resolved.access.role !== "teacher" && resolved.access.role !== "assistant") {
    return NextResponse.json({ error: "Only teaching staff can finish on leave" }, { status: 403 });
  }
  const { courseId, sessionId } = resolved.access;
  const ended = await leaveClassroomConnection(sessionId, resolved.session.userId, clientId, body.voluntary === true,
    explicit ? { intent: body.leaveIntent, cycleStartedAt: body.cycleStartedAt } : undefined);
  if (ended) clearCourseSessionAccessCache();
  // Cloud cleanup is independent of cache/webhook/summary availability.
  after(async () => {
    const tasks: Promise<unknown>[] = [deliverClassroomEvents()];
    if (ended) tasks.push(
      stopActiveRecordingsForCourse(courseId, sessionId, ended.endedAt),
      stopClassroomTranscription(courseId, sessionId, { endedBefore: ended.endedAt }),
      syncCourseStatusFromSessions(courseId),
      queueCourseSessionSummary(courseId, sessionId).then(() => processCourseSessionSummaryGeneration(sessionId)),
    );
    else tasks.push(syncClassroomTranscription(courseId, { sessionId }));
    const results = await Promise.allSettled(tasks);
    for (const result of results) if (result.status === "rejected") {
      console.error("[classroom:leave] cleanup pending reconciliation", { sessionId,
        message: result.reason instanceof Error ? result.reason.message : "Cleanup failed" });
    }
  });
  return NextResponse.json({ ok: true, classEnded: Boolean(ended) });
}

export async function POST(request: NextRequest) {
  try { return await handlePost(request); }
  catch (error) {
    const unavailable = databaseUnavailableResponse(error, { route: "classroom/session/leave", operation: "leave" });
    if (unavailable) return unavailable;
    throw error;
  }
}
