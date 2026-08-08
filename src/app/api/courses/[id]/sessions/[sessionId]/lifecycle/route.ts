import { after, NextRequest, NextResponse } from "next/server";
import { attendanceDurationSec } from "@/lib/course-attendance";
import {
  processRecordingStart,
  requestRecordingStart,
  stopActiveRecordingsForCourse,
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  if (identity.role !== "teacher") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
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
  if (!canManage) {
    const roster = await getEffectiveSessionRoster(sessionId);
    const member = roster ? rosterContainsUser(roster, identityAliases) : null;
    canManage =
      member?.kind === "teacher" && member.member.role === "teacher";
  }
  if (!canManage) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { identity, courseId, sessionId, lesson };
}

async function handlePost(request: NextRequest, context: Context) {
  const resolved = await manageableLesson(request, context);
  if ("error" in resolved) return resolved.error;
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
  } | null;
  if (
    body?.action !== "end" &&
    body?.action !== "reopen" &&
    body?.action !== "cancel" &&
    body?.action !== "restore"
  ) {
    return NextResponse.json(
      { error: 'action must be "end", "reopen", "cancel", or "restore"' },
      { status: 400 },
    );
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
      const openAttendances = await transaction.courseAttendance.findMany({
        where: { sessionId: resolved.sessionId, leftAt: null },
        select: { id: true, enteredAt: true },
      });
      for (const attendance of openAttendances) {
        await transaction.courseAttendance.update({
          where: { id: attendance.id },
          data: {
            leftAt: now,
            durationSec: attendanceDurationSec(attendance.enteredAt, now),
          },
        });
      }
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
      return transaction.courseSession.update({
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
    });
    clearCourseSessionAccessCache();
    await syncCourseStatusFromSessions(resolved.courseId);
    after(async () => {
      const results = await Promise.allSettled([
        stopActiveRecordingsForCourse(resolved.courseId, resolved.sessionId),
        stopClassroomTranscription(resolved.courseId, resolved.sessionId),
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
    return NextResponse.json({
      session: serializeCourseSession(updated),
      runtime: await getClassroomRuntimeSnapshot(
        resolved.courseId,
        resolved.sessionId,
        { ensure: false },
      ),
    });
  }

  if (
    resolved.lesson.status !== CourseStatus.FINISHED &&
    !(resolved.lesson.status === CourseStatus.AFTER_CLASS && resolved.lesson.endedAt)
  ) {
    return NextResponse.json(
      { error: "Only a finished lesson can be reopened" },
      { status: 409 },
    );
  }
  const updated = await prisma.$transaction(async (transaction) => {
    await transaction.classroomRuntime.updateMany({
      where: { sessionId: resolved.sessionId },
      data: {
        status: "live",
        startedAt: now,
        graceEndsAt: new Date(
          resolved.lesson.endTime.getTime() +
            getFinishedDelayMinutes() * 60_000,
        ),
        revision: { increment: 1 },
        transcriptionStatus: "stopped",
        transcriptionAgentId: null,
        transcriptionError: null,
      },
    });
    return transaction.courseSession.update({
      where: { id: resolved.sessionId },
      data: { status: CourseStatus.LIVE, endedAt: null },
      include: {
        series: true,
        teachers: true,
        students: true,
        groupLinks: true,
        _count: { select: { attendances: true, recordings: true } },
      },
    });
  });
  clearCourseSessionAccessCache();
  await syncCourseStatusFromSessions(resolved.courseId);
  const recording = await requestRecordingStart(
    resolved.courseId,
    resolved.sessionId,
  ).catch((error) => {
    console.error("[classroom:lifecycle] reopen recording request failed", {
      sessionId: resolved.sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  after(async () => {
    await Promise.allSettled([
      recording ? processRecordingStart(recording.id) : Promise.resolve(),
      syncClassroomTranscription(resolved.courseId, {
        sessionId: resolved.sessionId,
      }),
    ]);
  });
  return NextResponse.json({ session: serializeCourseSession(updated) });
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
