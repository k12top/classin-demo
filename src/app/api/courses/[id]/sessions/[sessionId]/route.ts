import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { assertCanTeachCourse } from "@/lib/course-teacher";
import { serializeCourseSession } from "@/lib/course-session-service";
import {
  getEffectiveSessionRoster,
  rosterContainsUser,
} from "@/lib/course-session-roster";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; sessionId: string }>;
};

async function managedCourse(request: NextRequest, context: Context) {
  const session = await getSessionFromRequest(request);
  const { id: courseId, sessionId } = await context.params;
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const lesson = await prisma.courseSession.findFirst({
    where: { id: sessionId, courseId },
    include: {
      series: true,
      teachers: true,
      students: true,
      groupLinks: true,
      _count: { select: { attendances: true, recordings: true } },
    },
  });
  if (!lesson) return { error: NextResponse.json({ error: "Session not found" }, { status: 404 }) };
  const canManageCourse = session.role === "teacher" &&
    (await assertCanTeachCourse(session.userId, courseId));
  if (!canManageCourse) {
    const roster = await getEffectiveSessionRoster(lesson.id);
    const aliases = Array.from(
      new Set([
        ...casdoorUserIdCandidates(session.userId),
        ...casdoorUserIdCandidates(session.name || ""),
      ]),
    );
    const member = roster ? rosterContainsUser(roster, aliases) : null;
    if (session.role !== "teacher" || member?.kind !== "teacher" || member.member.role !== "teacher") {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
  }
  return { session, courseId, lesson, canManageCourse };
}

export async function GET(request: NextRequest, context: Context) {
  const resolved = await managedCourse(request, context);
  if ("error" in resolved) return resolved.error;
  return NextResponse.json({ session: serializeCourseSession(resolved.lesson) });
}

function validMode(value: unknown): "inherit" | "custom" | undefined {
  return value === "inherit" || value === "custom" ? value : undefined;
}

function parseOptionalDate(value: unknown) {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function teacherRulesFrom(value: unknown, courseId: string, sessionId: string) {
  if (!Array.isArray(value)) return null;
  return value
    .map((item: Record<string, unknown>) => ({
      courseId,
      sessionId,
      teacherId: String(item.userId || item.teacherId || "").trim(),
      teacherName: String(item.displayName || item.teacherName || "").trim(),
      teacherAvatar: String(item.avatar || item.teacherAvatar || "").trim(),
      action: item.action === "exclude" ? "exclude" : "include",
      role: item.role === "teacher" ? "teacher" : "assistant",
    }))
    .filter((item: { teacherId: string }) => item.teacherId);
}

function studentRulesFrom(value: unknown, courseId: string, sessionId: string) {
  if (!Array.isArray(value)) return null;
  return value
    .map((item: Record<string, unknown>) => ({
      courseId,
      sessionId,
      studentId: String(item.userId || item.studentId || "").trim(),
      studentName: String(item.displayName || item.studentName || "").trim(),
      studentAvatar: String(item.avatar || item.studentAvatar || "").trim(),
      action: item.action === "exclude" ? "exclude" : "include",
    }))
    .filter((item: { studentId: string }) => item.studentId);
}

function groupRulesFrom(value: unknown, courseId: string, sessionId: string) {
  if (!Array.isArray(value)) return null;
  return value
    .map((item: Record<string, unknown>) => ({
      courseId,
      sessionId,
      groupId: String(item.groupId || item.id || "").trim(),
      action: item.action === "exclude" ? "exclude" : "include",
    }))
    .filter((item: { groupId: string }) => item.groupId);
}

export async function PATCH(request: NextRequest, context: Context) {
  const resolved = await managedCourse(request, context);
  if ("error" in resolved) return resolved.error;
  const body = await request.json();
  const nextStart = parseOptionalDate(body?.startTime);
  const nextEnd = parseOptionalDate(body?.endTime);
  if (nextStart === null || nextEnd === null) {
    return NextResponse.json({ error: "Invalid session time" }, { status: 400 });
  }
  if ((nextStart || nextEnd) && resolved.lesson.status !== "scheduled") {
    return NextResponse.json({ error: "Only scheduled sessions can be rescheduled" }, { status: 409 });
  }
  const startTime = nextStart || resolved.lesson.startTime;
  const endTime = nextEnd || resolved.lesson.endTime;
  if (endTime <= startTime) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  const scope = body?.scope === "future" ? "future" : "this";
  if (scope === "future" && !resolved.canManageCourse) {
    return NextResponse.json(
      { error: "Only course managers can update following lessons" },
      { status: 403 },
    );
  }
  const targets = scope === "future" && resolved.lesson.seriesId
    ? await prisma.courseSession.findMany({
        where: {
          courseId: resolved.courseId,
          seriesId: resolved.lesson.seriesId,
          status: "scheduled",
          isDetached: false,
          startTime: { gte: resolved.lesson.startTime },
        },
        orderBy: { startTime: "asc" },
      })
    : [resolved.lesson];
  const deltaMs = startTime.getTime() - resolved.lesson.startTime.getTime();
  const durationMs = endTime.getTime() - startTime.getTime();
  const teacherMode = validMode(body?.teacherMode);
  const studentMode = validMode(body?.studentMode);
  const requestedLeadId = typeof body?.leadTeacherId === "string"
    ? body.leadTeacherId.trim()
    : resolved.lesson.leadTeacherId || "";
  const requestedTeacherRules = teacherRulesFrom(
    body?.teachers,
    resolved.courseId,
    resolved.lesson.id,
  );
  const effectiveTeacherRules = requestedTeacherRules || resolved.lesson.teachers;
  const effectiveTeacherMode = teacherMode ||
    (resolved.lesson.teacherMode === "custom" ? "custom" : "inherit");
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: resolved.courseId },
    include: { teachers: true },
  });
  const effectiveTeacherIds = new Set<string>();
  if (effectiveTeacherMode === "inherit") {
    for (const teacher of course.teachers.length
      ? course.teachers
      : [{ teacherId: course.teacherId }]) {
      effectiveTeacherIds.add(teacher.teacherId);
    }
  }
  for (const rule of effectiveTeacherRules) {
    if (rule.action === "exclude") effectiveTeacherIds.delete(rule.teacherId);
    else effectiveTeacherIds.add(rule.teacherId);
  }
  if (!requestedLeadId || !effectiveTeacherIds.has(requestedLeadId)) {
    return NextResponse.json(
      { error: "Lesson lead must be part of the effective teaching team" },
      { status: 400 },
    );
  }
  const leadRule = effectiveTeacherRules.find(
    (rule) => rule.teacherId === requestedLeadId && rule.action !== "exclude",
  );
  const courseLead = course.teachers.find(
    (teacher) => teacher.teacherId === requestedLeadId,
  );
  const leadTeacherName = leadRule?.teacherName || courseLead?.teacherName ||
    (requestedLeadId === course.teacherId ? course.teacherName : requestedLeadId);
  const leadTeacherAvatar = leadRule?.teacherAvatar || courseLead?.teacherAvatar ||
    (requestedLeadId === course.teacherId ? course.teacherAvatar : "");
  const requestedStudentRules = studentRulesFrom(
    body?.students,
    resolved.courseId,
    resolved.lesson.id,
  );
  const requestedGroupRules = groupRulesFrom(
    body?.groups,
    resolved.courseId,
    resolved.lesson.id,
  );
  if (requestedGroupRules?.length) {
    const allowedGroupCount = await prisma.studentGroup.count({
      where: {
        id: { in: requestedGroupRules.map((rule) => rule.groupId) },
        OR: [
          { createdBy: resolved.session.userId },
          { createdBy: course.ownerId },
          { courseLinks: { some: { courseId: resolved.courseId } } },
        ],
      },
    });
    if (allowedGroupCount !== requestedGroupRules.length) {
      return NextResponse.json({ error: "Forbidden student group" }, { status: 403 });
    }
  }

  await prisma.$transaction(async (transaction) => {
    for (const target of targets) {
      const targetStart = nextStart
        ? new Date(target.startTime.getTime() + deltaMs)
        : target.startTime;
      const targetEnd = nextEnd || nextStart
        ? new Date(targetStart.getTime() + durationMs)
        : target.endTime;
      await transaction.courseSession.update({
        where: { id: target.id },
        data: {
          ...(typeof body?.title === "string" && { title: body.title.trim() }),
          ...(nextStart && { startTime: targetStart }),
          ...((nextEnd || nextStart) && { endTime: targetEnd }),
          ...(typeof body?.roomType === "number" && { roomType: body.roomType }),
          ...(teacherMode && { teacherMode }),
          ...(studentMode && { studentMode }),
          leadTeacherId: requestedLeadId,
          leadTeacherName,
          leadTeacherAvatar,
          ...(scope === "this" && resolved.lesson.seriesId && { isDetached: true }),
        },
      });
      if (requestedTeacherRules) {
        await transaction.courseSessionTeacher.deleteMany({
          where: { sessionId: target.id },
        });
        if (requestedTeacherRules.length) {
          await transaction.courseSessionTeacher.createMany({
            data: requestedTeacherRules.map((rule) => ({
              ...rule,
              sessionId: target.id,
              role: rule.teacherId === requestedLeadId ? "teacher" : rule.role,
            })),
          });
        }
      }
      if (requestedStudentRules) {
        await transaction.courseSessionStudent.deleteMany({
          where: { sessionId: target.id },
        });
        if (requestedStudentRules.length) {
          await transaction.courseSessionStudent.createMany({
            data: requestedStudentRules.map((rule) => ({
              ...rule,
              sessionId: target.id,
            })),
          });
        }
      }
      if (requestedGroupRules) {
        await transaction.courseSessionGroupLink.deleteMany({
          where: { sessionId: target.id },
        });
        if (requestedGroupRules.length) {
          await transaction.courseSessionGroupLink.createMany({
            data: requestedGroupRules.map((rule) => ({
              ...rule,
              sessionId: target.id,
            })),
          });
        }
      }
    }
  });

  const updated = await prisma.courseSession.findUniqueOrThrow({
    where: { id: resolved.lesson.id },
    include: { series: true, teachers: true, students: true, groupLinks: true },
  });
  return NextResponse.json({ session: serializeCourseSession(updated) });
}

export async function DELETE(request: NextRequest, context: Context) {
  const resolved = await managedCourse(request, context);
  if ("error" in resolved) return resolved.error;
  const runtimeCount = await prisma.classroomRuntime.count({
    where: { sessionId: resolved.lesson.id },
  });
  const hasActivity =
    resolved.lesson.status !== "scheduled" ||
    resolved.lesson._count.attendances > 0 ||
    resolved.lesson._count.recordings > 0 ||
    runtimeCount > 0;
  if (hasActivity) {
    const cancelled = await prisma.courseSession.update({
      where: { id: resolved.lesson.id },
      data: { status: "cancelled", endedAt: new Date() },
    });
    return NextResponse.json({ session: serializeCourseSession(cancelled), cancelled: true });
  }
  await prisma.courseSession.delete({ where: { id: resolved.lesson.id } });
  return NextResponse.json({ deleted: true });
}
