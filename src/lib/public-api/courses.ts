import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateCourseRoomUuid } from "@/lib/course-room";
import { defaultAutoStudentOnStage } from "@/lib/classroom/mode";
import { aggregateCourseSessionStatus } from "@/lib/course-session-status-logic";
import { clearCourseSessionAccessCache } from "@/lib/course-session-access";
import { closeAllOpenAttendanceForLesson } from "@/lib/course-attendance";
import { enqueueClassroomEvent } from "@/lib/classroom/server/integration-events";
import { PublicApiError, type PublicCourseInput, type PublicSessionInput } from "./input";

const courseSelect = {
  id: true, name: true, description: true, roomType: true, autoStudentOnStage: true,
  ownerId: true, ownerName: true, teacherId: true, teacherName: true,
  courseKind: true, lifecycleStatus: true, status: true, studentRemarks: true,
  createdAt: true, updatedAt: true, _count: { select: { sessions: true } },
} satisfies Prisma.CourseSelect;

const sessionSelect = {
  id: true, courseId: true, title: true, position: true, roomType: true,
  leadTeacherId: true, leadTeacherName: true, status: true, startTime: true,
  endTime: true, endedAt: true, createdAt: true, updatedAt: true,
  students: { where: { action: "include" }, select: { studentId: true, studentName: true } },
  classroomRuntime: { select: { status: true, startedAt: true } },
} satisfies Prisma.CourseSessionSelect;

function courseJson(course: Prisma.CourseGetPayload<{ select: typeof courseSelect }>) {
  const { _count, ...fields } = course;
  return { ...fields, sessionCount: _count.sessions, createdAt: course.createdAt.toISOString(), updatedAt: course.updatedAt.toISOString() };
}

function sessionJson(session: Prisma.CourseSessionGetPayload<{ select: typeof sessionSelect }>) {
  const { classroomRuntime, students, ...fields } = session;
  return {
    ...fields, students: students.map((student) => ({ userId: student.studentId, displayName: student.studentName })),
    classroomStatus: classroomRuntime?.status ?? (session.endedAt || ["finished", "cancelled"].includes(session.status) ? "ended" : "waiting"),
    startedAt: classroomRuntime?.startedAt?.toISOString() ?? null,
    startTime: session.startTime.toISOString(), endTime: session.endTime.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(), updatedAt: session.updatedAt.toISOString(),
  };
}

function notFound(): never { throw new PublicApiError(404, "not_found", "Public course or session not found"); }
function conflict(message: string): never { throw new PublicApiError(409, "conflict", message); }

async function publicCourse(tx: Prisma.TransactionClient, courseId: string, lock = false) {
  if (lock) await tx.$queryRaw`SELECT "id" FROM "Course" WHERE "id" = ${courseId} AND "publicApiManaged" = true FOR UPDATE`;
  const course = await tx.course.findFirst({ where: { id: courseId, publicApiManaged: true }, include: { teachers: true } });
  if (!course) return notFound();
  return course;
}

async function sessionOf(tx: Prisma.TransactionClient, courseId: string, sessionId: string) {
  const session = await tx.courseSession.findFirst({ where: { id: sessionId, courseId }, include: { classroomRuntime: true, _count: { select: { attendances: true, recordings: true, studentSubmissions: true } } } });
  if (!session) return notFound();
  return session;
}

async function projectCourse(tx: Prisma.TransactionClient, courseId: string) {
  const sessions = await tx.courseSession.findMany({ where: { courseId }, orderBy: [{ startTime: "asc" }, { position: "asc" }] });
  const now = new Date();
  const display = sessions.find((session) => !session.endedAt && session.status === "live") ||
    sessions.find((session) => !session.endedAt && session.status === "scheduled" && session.endTime >= now) || sessions.at(-1);
  await tx.course.update({ where: { id: courseId }, data: {
    status: aggregateCourseSessionStatus(sessions, now),
    ...(display ? { roomUuid: display.roomUuid, startTime: display.startTime, endTime: display.endTime, endedAt: display.endedAt } : { roomUuid: null, startTime: null, endTime: null, endedAt: null }),
  } });
}

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

async function createOnce(scope: string, key: string | undefined, input: unknown, operation: (tx: Prisma.TransactionClient) => Promise<object>) {
  return prisma.$transaction(async (tx) => {
    const id = key ? createHash("sha256").update(`${scope}:${key}`).digest("hex") : undefined;
    const requestHash = createHash("sha256").update(canonical(input)).digest("hex");
    if (id) {
      // Serialize only identical request keys, including concurrent retries
      // before a successful operation has created its ledger row.
      const lock = BigInt.asIntN(64, BigInt(`0x${id.slice(0, 16)}`));
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lock})::text`;
      const previous = await tx.publicApiRequest.findUnique({ where: { id } });
      if (previous) {
        if (previous.requestHash !== requestHash) conflict("Idempotency-Key was already used with different parameters");
        return { body: previous.response, replayed: true };
      }
    }
    const response = await operation(tx);
    const json = JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue;
    if (id) await tx.publicApiRequest.create({ data: { id, requestHash, response: json } });
    return { body: json, replayed: false };
  }, { timeout: 15_000 });
}

export async function createPublicCourse(input: PublicCourseInput, key?: string) {
  return createOnce(`course:${input.ownerId}`, key, input, async (tx) => {
    const teacherId = input.teacherId || input.ownerId!;
    const teacherName = input.teacherName || (teacherId === input.ownerId ? input.ownerName : undefined) || teacherId;
    const course = await tx.course.create({ data: {
      publicApiManaged: true, name: input.name!, description: input.description || "",
      studentRemarks: input.studentRemarks || "", roomType: input.roomType ?? 0,
      autoStudentOnStage: input.autoStudentOnStage ?? defaultAutoStudentOnStage(input.roomType ?? 0),
      ownerId: input.ownerId!, ownerName: input.ownerName || input.ownerId!,
      teacherId, teacherName, courseKind: input.courseKind || "series", lifecycleStatus: "draft",
      teachers: { create: { teacherId, teacherName } },
    }, select: courseSelect });
    return { course: courseJson(course) };
  });
}

export async function listPublicCourses(page: { limit: number; after?: string; ownerId?: string }) {
  const courses = await prisma.course.findMany({
    where: { publicApiManaged: true, ...(page.ownerId && { ownerId: page.ownerId }), ...(page.after && { id: { gt: page.after } }) },
    orderBy: { id: "asc" }, take: page.limit + 1, select: courseSelect,
  });
  return { courses: courses.slice(0, page.limit).map(courseJson), nextCursor: courses.length > page.limit ? courses[page.limit - 1].id : null };
}

export async function getPublicCourse(courseId: string) {
  const course = await prisma.course.findFirst({ where: { id: courseId, publicApiManaged: true }, select: courseSelect });
  if (!course) return notFound();
  return { course: courseJson(course) };
}

export async function updatePublicCourse(courseId: string, input: PublicCourseInput) {
  const result = await prisma.$transaction(async (tx) => {
    const course = await publicCourse(tx, courseId, true);
    if (course.lifecycleStatus === "archived") conflict("Archived courses cannot be edited");
    return { course: courseJson(await tx.course.update({ where: { id: courseId }, data: {
      name: input.name, description: input.description, studentRemarks: input.studentRemarks,
      roomType: input.roomType, autoStudentOnStage: input.autoStudentOnStage,
    }, select: courseSelect })) };
  });
  clearCourseSessionAccessCache();
  return result;
}

export async function createPublicSession(courseId: string, input: PublicSessionInput, key?: string) {
  const result = await createOnce(`session:${courseId}`, key, input, async (tx) => {
    const course = await publicCourse(tx, courseId, true);
    if (course.lifecycleStatus === "archived") conflict("Archived courses cannot have new sessions");
    const last = await tx.courseSession.aggregate({ where: { courseId }, _max: { position: true }, _count: { id: true } });
    if (course.courseKind === "standalone" && last._count.id) conflict("Standalone courses can have only one session");
    const position = (last._max.position || 0) + 1;
    const session = await tx.courseSession.create({ data: {
      courseId, position, title: input.title || `${course.name} · 第 ${position} 课`,
      startTime: input.startTime!, endTime: input.endTime!, roomUuid: generateCourseRoomUuid(),
      roomType: input.roomType ?? course.roomType, classroomProvider: course.classroomProvider, recordingProvider: course.recordingProvider,
      createdBy: course.ownerId, leadTeacherId: course.teacherId, leadTeacherName: course.teacherName, leadTeacherAvatar: course.teacherAvatar,
      // The supplied list is an independent lesson roster. Omission inherits
      // the course roster; an empty list deliberately creates an empty roster.
      studentMode: input.students === undefined ? "inherit" : "custom",
      ...(input.students && { students: { create: input.students.map((student) => ({ courseId, studentId: student.userId, studentName: student.displayName, action: "include" })) } }),
    }, select: sessionSelect });
    await tx.course.update({ where: { id: courseId }, data: { lifecycleStatus: "active" } });
    await projectCourse(tx, courseId);
    return { session: sessionJson(session) };
  });
  clearCourseSessionAccessCache();
  return result;
}

export async function listPublicSessions(courseId: string, page: { limit: number; after?: string }) {
  return prisma.$transaction(async (tx) => {
    await publicCourse(tx, courseId);
    const sessions = await tx.courseSession.findMany({ where: { courseId, ...(page.after && { id: { gt: page.after } }) }, orderBy: { id: "asc" }, take: page.limit + 1, select: sessionSelect });
    return { sessions: sessions.slice(0, page.limit).map(sessionJson), nextCursor: sessions.length > page.limit ? sessions[page.limit - 1].id : null };
  });
}

export async function getPublicSession(courseId: string, sessionId: string) {
  return prisma.$transaction(async (tx) => {
    await publicCourse(tx, courseId);
    const session = await tx.courseSession.findFirst({ where: { courseId, id: sessionId }, select: sessionSelect });
    if (!session) return notFound();
    return { session: sessionJson(session) };
  });
}

export async function updatePublicSession(courseId: string, sessionId: string, input: PublicSessionInput) {
  const result = await prisma.$transaction(async (tx) => {
    // Runtime locks use the same order as classroom start/end operations.
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} AND "courseId" = ${courseId} AND EXISTS (SELECT 1 FROM "Course" c WHERE c."id" = ${courseId} AND c."publicApiManaged" = true) FOR UPDATE`;
    const course = await publicCourse(tx, courseId, true);
    if (course.lifecycleStatus === "archived") conflict("Archived courses cannot be edited");
    const session = await sessionOf(tx, courseId, sessionId);
    if (session.endedAt || ["finished", "cancelled"].includes(session.status) || session.classroomRuntime?.status === "ended") conflict("Ended sessions cannot be edited");
    const structure = input.startTime || input.endTime || input.roomType !== undefined || input.students !== undefined;
    if (structure && (session.status !== "scheduled" || session.classroomRuntime?.status === "live" || session.classroomRuntime?.startedAt)) conflict("Only an unstarted scheduled session can change schedule, room type or roster");
    const startTime = input.startTime || session.startTime, endTime = input.endTime || session.endTime;
    if (endTime <= startTime) throw new PublicApiError(400, "invalid_request", "endTime must be after startTime");
    await tx.courseSession.update({ where: { id: sessionId }, data: {
      title: input.title, startTime: input.startTime, endTime: input.endTime, roomType: input.roomType,
      ...(input.students !== undefined && { studentMode: "custom" }),
      ...(session.seriesId && { isDetached: true }),
    } });
    if (input.students !== undefined) {
      await tx.courseSessionStudent.deleteMany({ where: { sessionId } });
      if (input.students.length) await tx.courseSessionStudent.createMany({ data: input.students.map((student) => ({ courseId, sessionId, studentId: student.userId, studentName: student.displayName, action: "include" })) });
    }
    await projectCourse(tx, courseId);
    return { session: sessionJson(await tx.courseSession.findUniqueOrThrow({ where: { id: sessionId }, select: sessionSelect })) };
  });
  clearCourseSessionAccessCache();
  return result;
}

async function cancelSession(tx: Prisma.TransactionClient, session: Awaited<ReturnType<typeof sessionOf>>) {
  const now = session.endedAt || new Date();
  const wasEnded = Boolean(session.endedAt || session.classroomRuntime?.status === "ended" || ["finished", "cancelled"].includes(session.status));
  await closeAllOpenAttendanceForLesson(session.id, now, tx);
  await tx.classroomRuntime.updateMany({ where: { sessionId: session.id, status: { not: "ended" } }, data: { status: "ended", revision: { increment: 1 }, transcriptionStatus: "stopping" } });
  await tx.classroomRecording.updateMany({ where: { sessionId: session.id, status: { in: ["starting", "recording", "stopping"] } }, data: { status: "stopping", stopRequestedAt: now, lastProviderCheckAt: null } });
  await tx.courseSession.update({ where: { id: session.id }, data: { status: "cancelled", endedAt: now } });
  if (!wasEnded) await enqueueClassroomEvent(tx, session.id, "classroom.ended", "deleted");
}

function hasHistory(session: Awaited<ReturnType<typeof sessionOf>>) {
  return session.status !== "scheduled" || Boolean(session.classroomRuntime) || session._count.attendances > 0 || session._count.recordings > 0 || session._count.studentSubmissions > 0;
}

export async function deletePublicSession(courseId: string, sessionId: string) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} AND "courseId" = ${courseId} AND EXISTS (SELECT 1 FROM "Course" c WHERE c."id" = ${courseId} AND c."publicApiManaged" = true) FOR UPDATE`;
    await publicCourse(tx, courseId, true);
    const session = await sessionOf(tx, courseId, sessionId);
    if (hasHistory(session)) {
      await cancelSession(tx, session);
      await projectCourse(tx, courseId);
      return { body: { deleted: false, cancelled: true, session: sessionJson(await tx.courseSession.findUniqueOrThrow({ where: { id: sessionId }, select: sessionSelect })) }, cleanup: [sessionId] };
    }
    await tx.courseSession.delete({ where: { id: sessionId } });
    await projectCourse(tx, courseId);
    return { body: { deleted: true, cancelled: false }, cleanup: [] };
  }, { timeout: 15_000 });
  clearCourseSessionAccessCache();
  return result;
}

export async function deletePublicCourse(courseId: string) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "courseId" = ${courseId} AND EXISTS (SELECT 1 FROM "Course" c WHERE c."id" = ${courseId} AND c."publicApiManaged" = true) ORDER BY "id" FOR UPDATE`;
    await publicCourse(tx, courseId, true);
    const sessions = await tx.courseSession.findMany({ where: { courseId }, include: { classroomRuntime: true, _count: { select: { attendances: true, recordings: true, studentSubmissions: true } } } });
    const hasCourseHistory = sessions.some(hasHistory) || await tx.courseware.count({ where: { courseId } }) > 0 || await tx.coursePlaybackProgress.count({ where: { courseId } }) > 0;
    if (!hasCourseHistory) {
      await tx.course.delete({ where: { id: courseId } });
      return { body: { deleted: true, archived: false }, cleanup: [] };
    }
    for (const session of sessions) await cancelSession(tx, session);
    await tx.courseJoinLink.updateMany({ where: { courseId, revokedAt: null }, data: { revokedAt: new Date() } });
    const course = await tx.course.update({ where: { id: courseId }, data: { lifecycleStatus: "archived", status: "cancelled", endedAt: new Date() }, select: courseSelect });
    return { body: { deleted: false, archived: true, course: courseJson(course) }, cleanup: sessions.map((session) => session.id) };
  }, { timeout: 30_000 });
  clearCourseSessionAccessCache();
  return result;
}
