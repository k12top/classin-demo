import { changeClassroomTiming } from "@/lib/classroom/server/class-timing";
import { validClassroomCommandId } from "@/lib/classroom/server/command-receipt";
import { synchronizeClassroomRedis } from "@/lib/classroom/server/redis-sync";
import { after, NextRequest, NextResponse } from "next/server";
import { enqueueClassroomEvent, deliverClassroomEvents } from "@/lib/classroom/server/integration-events";
import { closeAllOpenAttendanceForLesson } from "@/lib/course-attendance";
import {
  processRecordingStart,
  stopActiveRecordingsForCourse,
  recoverInterruptedRecordingForSession,
} from "@/lib/classroom/server/recording-orchestrator";
import {
  stopClassroomTranscription,
  syncClassroomTranscription,
} from "@/lib/classroom/server/transcription-orchestrator";
import { getClassroomRuntimeSnapshot } from "@/lib/classroom/server/runtime";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import {
  getEffectiveSessionRoster,
  rosterContainsUser,
} from "@/lib/course-session-roster";
import { serializeCourseSession } from "@/lib/course-session-service";
import { clearCourseSessionAccessCache } from "@/lib/course-session-access";
import {
  CourseStatus,
  getFinishedDelayMinutes,
  resolveManualFinishedStatus,
} from "@/lib/course-status";
import { prisma } from "@/lib/db";
import { databaseUnavailableResponse } from "@/lib/database-response";
import { getSessionFromRequest } from "@/lib/session";
import { syncCourseStatusFromSessions } from "@/lib/course-session-status";
import { processCourseSessionSummaryGeneration, queueCourseSessionSummary } from "@/lib/course-session-summary-generation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Context = {
  params: Promise<{ id: string; sessionId: string }>;
};

async function manageableLesson(request: NextRequest, context: Context) {
  const identity = await getSessionFromRequest(request);
  if (!identity) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { id: courseId, sessionId } = await context.params;
  const lesson = await prisma.courseSession.findFirst({
    where: { id: sessionId, courseId },
    include: {
      course: { select: { ownerId: true, teacherId: true } },
      teachers: true,
      students: true,
      groupLinks: true,
      series: true,
      _count: { select: { attendances: true, recordings: true } },
    },
  });
  if (!lesson) {
    return { error: NextResponse.json({ error: "Session not found" }, { status: 404 }) };
  }
  const identityAliases = Array.from(
    new Set(
      [identity.userId, identity.name || ""]
        .flatMap(casdoorUserIdCandidates)
        .filter(Boolean),
    ),
  );
  let canManage = identityAliases.some(
    (candidate) =>
      casdoorUserIdsMatch(lesson.course.ownerId, candidate) ||
      casdoorUserIdsMatch(lesson.course.teacherId, candidate),
  );
  let classroomRole: "teacher" | "assistant" = "teacher";
  if (!canManage) {
    const roster = await getEffectiveSessionRoster(sessionId);
    const member = roster ? rosterContainsUser(roster, identityAliases) : null;
    canManage = member?.kind === "teacher";
    if (member?.kind === "teacher") classroomRole = member.member.role;
  }
  if (!canManage) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { identity, courseId, sessionId, lesson, classroomRole };
}

async function handlePost(request: NextRequest, context: Context) {
  const resolved = await manageableLesson(request, context);
  if ("error" in resolved) return resolved.error;
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    minutes?: unknown;
    commandId?: unknown;
  } | null;
  if (
    body?.action !== "extend" &&
    body?.action !== "end" &&
    body?.action !== "reopen" &&
    body?.action !== "cancel" &&
    body?.action !== "restore"
  ) {
    return NextResponse.json(
      { error: 'action must be "end", "reopen", "extend", "cancel", or "restore"' },
      { status: 400 },
    );
  }

  if (body.commandId !== undefined && !validClassroomCommandId(body.commandId)) return NextResponse.json({ error: "Invalid command identifier" }, { status: 400 });
  if (body.action === "extend" || body.action === "reopen") {
    try {
      if (body.action === "reopen") {
        const closing = await prisma.classroomRuntime.findUnique({ where: { sessionId: resolved.sessionId }, select: { status: true, transcriptionStatus: true } });
        // Recover an interrupted end callback before admitting a new cycle.
        if (closing?.status === "ended" && closing.transcriptionStatus === "stopping") await stopClassroomTranscription(resolved.courseId, resolved.sessionId, { endedBefore: new Date() });
      }
      const timing = await changeClassroomTiming({ sessionId: resolved.sessionId, courseId: resolved.courseId, actorId: resolved.identity.userId,
        role: resolved.classroomRole, action: body.action, commandId: typeof body.commandId === "string" ? body.commandId : undefined, minutes: typeof body.minutes === "number" ? body.minutes : undefined });
      clearCourseSessionAccessCache();
      await synchronizeClassroomRedis(resolved.sessionId, true);
      after(() => deliverClassroomEvents());
      if (body.action === "reopen" || body.action === "extend") after(async () => {
        const outcomes = await Promise.allSettled([
          (async () => {
            if (body.action === "reopen") {
              // Finish the previous provider attempt before starting its successor.
              await stopActiveRecordingsForCourse(resolved.courseId, resolved.sessionId, new Date(Date.parse(timing.startTime) - 1));
              if (timing.recordingId) await processRecordingStart(timing.recordingId);
            }
            await recoverInterruptedRecordingForSession(resolved.courseId, resolved.sessionId);
          })(),
          ...(body.action === "reopen" ? [syncClassroomTranscription(resolved.courseId, { sessionId: resolved.sessionId })] : []),
        ]);
        for (const outcome of outcomes) if (outcome.status === "rejected") console.error("[classroom:lifecycle] continuity pending cron recovery", { sessionId: resolved.sessionId, name: outcome.reason instanceof Error ? outcome.reason.name : "UnknownError" });
      });
      return NextResponse.json({ timing });
    } catch (error) {
      if (error && typeof error === "object" && "status" in error && typeof error.status === "number") return NextResponse.json({ error: error instanceof Error ? error.message : "Operation failed" }, { status: error.status });
      throw error;
    }
  }
  const now = new Date();
  if (body.action === "cancel") {
    if (resolved.lesson.status !== CourseStatus.SCHEDULED) {
      return NextResponse.json(
        { error: "Only a scheduled lesson can be cancelled" },
        { status: 409 },
      );
    }
    const updated = await prisma.courseSession.update({
      where: { id: resolved.sessionId },
      data: { status: CourseStatus.CANCELLED, endedAt: now },
      include: {
        series: true,
        teachers: true,
        students: true,
        groupLinks: true,
        _count: { select: { attendances: true, recordings: true } },
      },
    });
    clearCourseSessionAccessCache();
    await syncCourseStatusFromSessions(resolved.courseId);
    return NextResponse.json({ session: serializeCourseSession(updated) });
  }

  if (body.action === "restore") {
    if (resolved.lesson.status !== CourseStatus.CANCELLED) {
      return NextResponse.json(
        { error: "Only a cancelled lesson can be restored" },
        { status: 409 },
      );
    }
    const restoreDeadline = new Date(
      resolved.lesson.endTime.getTime() + getFinishedDelayMinutes() * 60_000,
    );
    if (now > restoreDeadline) {
      return NextResponse.json(
        { error: "This lesson is past its restore window; schedule a new lesson instead" },
        { status: 409 },
      );
    }
    const status = now < resolved.lesson.startTime
      ? CourseStatus.SCHEDULED
      : CourseStatus.LIVE;
    const updated = await prisma.courseSession.update({
      where: { id: resolved.sessionId },
      data: { status, endedAt: null },
      include: {
        series: true,
        teachers: true,
        students: true,
        groupLinks: true,
        _count: { select: { attendances: true, recordings: true } },
      },
    });
    clearCourseSessionAccessCache();
    await syncCourseStatusFromSessions(resolved.courseId);
    return NextResponse.json({ session: serializeCourseSession(updated) });
  }

  if (body.action === "end") {
    const nextStatus = resolveManualFinishedStatus(
      resolved.lesson.status,
      resolved.lesson.endTime,
      false,
    );
    if (!nextStatus) {
      return NextResponse.json(
        { error: "Cancelled lessons cannot be ended" },
        { status: 409 },
      );
    }
    const updated = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${resolved.sessionId} FOR UPDATE`;
      await closeAllOpenAttendanceForLesson(resolved.sessionId, now, transaction);
      await transaction.classroomRuntime.updateMany({
        where: { sessionId: resolved.sessionId },
        data: {
          status: "ended",
          revision: { increment: 1 },
          transcriptionStatus: "stopping",
        },
      });
      await transaction.classroomRecording.updateMany({
        where: {
          sessionId: resolved.sessionId,
          status: { in: ["starting", "recording", "stopping"] },
        },
        data: {
          status: "stopping",
          stopRequestedAt: now,
          lastProviderCheckAt: null,
          errorMessage: null,
          failureStage: null,
        },
      });
      const lesson = await transaction.courseSession.update({
        where: { id: resolved.sessionId },
        // Keep a manually ended lesson in AFTER_CLASS during its grace window.
        // Existing classroom members can then receive the terminal runtime
        // snapshot before normal entry is closed when it becomes FINISHED.
        data: { status: nextStatus, endedAt: now },
        include: {
          series: true,
          teachers: true,
          students: true,
          groupLinks: true,
          _count: { select: { attendances: true, recordings: true } },
        },
      });
      await enqueueClassroomEvent(transaction, resolved.sessionId, "classroom.ended", "teacher_end", { userId: resolved.identity.userId, role: resolved.classroomRole });
      return lesson;
    });
    clearCourseSessionAccessCache();
    let courseStatusSynced = false;
    try {
      await syncCourseStatusFromSessions(resolved.courseId);
      courseStatusSynced = true;
    } catch (error) {
      // The lesson has already ended. A secondary course-level projection must
      // not make the first click look unsuccessful and invite another click.
      console.error("[classroom:lifecycle] course status sync failed after end", {
        courseId: resolved.courseId,
        sessionId: resolved.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    after(() => deliverClassroomEvents());
    // Persist the job before responding; provider shutdown must not delay it.
    try {
      await queueCourseSessionSummary(resolved.courseId, resolved.sessionId);
      after(() => processCourseSessionSummaryGeneration(resolved.sessionId).then(() => undefined));
    } catch (error) {
      console.error("[classroom:lifecycle] summary queue pending cron recovery", { sessionId: resolved.sessionId, name: error instanceof Error ? error.name : "UnknownError" });
    }
    after(async () => {
      if (!courseStatusSynced) {
        try {
          await syncCourseStatusFromSessions(resolved.courseId);
        } catch (error) {
          console.error("[classroom:lifecycle] course status sync retry failed", {
            courseId: resolved.courseId,
            sessionId: resolved.sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const results = await Promise.allSettled([
        stopActiveRecordingsForCourse(resolved.courseId, resolved.sessionId, now),
        stopClassroomTranscription(resolved.courseId, resolved.sessionId, { endedBefore: now }),
      ]);
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[classroom:lifecycle] provider cleanup failed", {
            courseId: resolved.courseId,
            sessionId: resolved.sessionId,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          });
        }
      }
    });
    let runtime = null;
    try {
      runtime = await getClassroomRuntimeSnapshot(
        resolved.courseId,
        resolved.sessionId,
        { ensure: false },
      );
    } catch (error) {
      console.error("[classroom:lifecycle] runtime read failed after end", {
        courseId: resolved.courseId,
        sessionId: resolved.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return NextResponse.json({
      session: serializeCourseSession(updated),
      runtime,
    });
  }

  return NextResponse.json({ error: "Unsupported lifecycle action" }, { status: 400 });
}

export async function POST(request: NextRequest, context: Context) {
  try {
    return await handlePost(request, context);
  } catch (error) {
    const unavailable = databaseUnavailableResponse(error);
    if (unavailable) return unavailable;
    throw error;
  }
}
