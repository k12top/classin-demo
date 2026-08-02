import { prisma } from "@/lib/db";
import {
  canEnterClassroom,
  courseNotStartedReason,
  CourseStatus,
  getEarlyClassroomEntryMinutes,
  getFinishedDelayMinutes,
  isTooEarlyToEnterClassroom,
} from "@/lib/course-status";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";
import {
  getEffectiveSessionRoster,
  resolveCourseSessionReference,
  rosterContainsUser,
} from "@/lib/course-session-roster";
import type { ClassroomRole } from "@/lib/classroom/types";
import { verifyShareAccessToken } from "@/lib/join-link";

type ResolvedCourseSession = NonNullable<
  Awaited<ReturnType<typeof resolveCourseSessionReference>>
>;

export async function promoteCourseSessionIfDue(
  lesson: ResolvedCourseSession,
) {
  const now = new Date();
  const finishThreshold = new Date(
    now.getTime() - getFinishedDelayMinutes() * 60_000,
  );
  const shouldFinish =
    (lesson.status === CourseStatus.SCHEDULED ||
      lesson.status === CourseStatus.LIVE ||
      lesson.status === CourseStatus.AFTER_CLASS) &&
    lesson.endTime <= finishThreshold;
  const shouldStart =
    lesson.status === CourseStatus.SCHEDULED && lesson.startTime <= now;
  const status = shouldFinish
    ? CourseStatus.FINISHED
    : shouldStart
      ? CourseStatus.LIVE
      : lesson.status;
  if (status === lesson.status) return lesson;
  return prisma.courseSession.update({
    where: { id: lesson.id },
    data: { status },
  });
}

export type CourseSessionAccessResult =
  | {
      ok: true;
      role: ClassroomRole;
      temporary: boolean;
      courseId: string;
      sessionId: string;
      roomUuid: string;
      roomName: string;
      roomType: number;
      teacherName: string;
      startTime: Date;
      endTime: Date;
    }
  | {
      ok: false;
      httpStatus: number;
      code: string;
      reason: string;
    };

export async function resolveCourseSessionAccess(
  referenceId: string,
  userId: string,
  options: {
    userIdAliases?: readonly string[];
    shareAccessToken?: string | null;
  } = {},
): Promise<CourseSessionAccessResult> {
  const initial = await resolveCourseSessionReference(referenceId);
  if (!initial) {
    return { ok: false, httpStatus: 404, code: "not_found", reason: "课次不存在" };
  }
  const lesson = await promoteCourseSessionIfDue(initial);
  if (!lesson) {
    return { ok: false, httpStatus: 404, code: "not_found", reason: "课次不存在" };
  }
  if (!canEnterClassroom(lesson.status)) {
    return {
      ok: false,
      httpStatus: 403,
      code: lesson.status === CourseStatus.CANCELLED ? "course_cancelled" : "course_finished",
      reason: lesson.status === CourseStatus.CANCELLED ? "课次已取消" : "课次已结束",
    };
  }
  const earlyMinutes = getEarlyClassroomEntryMinutes();
  if (isTooEarlyToEnterClassroom(lesson.startTime, new Date(), earlyMinutes)) {
    return {
      ok: false,
      httpStatus: 403,
      code: "course_not_started",
      reason: courseNotStartedReason(earlyMinutes),
    };
  }
  const roster = await getEffectiveSessionRoster(lesson.id);
  if (!roster || !roster.leadTeacherId) {
    return {
      ok: false,
      httpStatus: 409,
      code: "session_roster_invalid",
      reason: "课次尚未配置有效主讲老师",
    };
  }
  const candidates = Array.from(
    new Set(
      [userId, ...(options.userIdAliases || [])]
        .flatMap(casdoorUserIdCandidates)
        .filter(Boolean),
    ),
  );
  const member = rosterContainsUser(roster, candidates);
  const lead = roster.teachers.find((teacher) => teacher.userId === roster.leadTeacherId)!;
  if (member?.kind === "teacher") {
    return {
      ok: true,
      role: member.member.role,
      temporary: false,
      courseId: lesson.courseId,
      sessionId: lesson.id,
      roomUuid: lesson.roomUuid,
      roomName: lesson.title,
      roomType: lesson.roomType,
      teacherName: lead.displayName,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
    };
  }
  if (member?.kind === "student") {
    return {
      ok: true,
      role: "student",
      temporary: member.member.temporary,
      courseId: lesson.courseId,
      sessionId: lesson.id,
      roomUuid: lesson.roomUuid,
      roomName: lesson.title,
      roomType: lesson.roomType,
      teacherName: lead.displayName,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
    };
  }
  const shareAccess = await verifyShareAccessToken(options.shareAccessToken, {
    userId,
    courseId: lesson.courseId,
    sessionId: lesson.id,
  });
  if (shareAccess.ok) {
    return {
      ok: true,
      role: "student",
      temporary: true,
      courseId: lesson.courseId,
      sessionId: lesson.id,
      roomUuid: lesson.roomUuid,
      roomName: lesson.title,
      roomType: lesson.roomType,
      teacherName: lead.displayName,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
    };
  }
  if (lesson.roomType === 10) {
    const course = await prisma.course.findUnique({
      where: { id: lesson.courseId },
      select: { passcode: true },
    });
    if (course && !course.passcode) {
      return {
        ok: true,
        role: "student",
        temporary: true,
        courseId: lesson.courseId,
        sessionId: lesson.id,
        roomUuid: lesson.roomUuid,
        roomName: lesson.title,
        roomType: lesson.roomType,
        teacherName: lead.displayName,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
      };
    }
  }
  return {
    ok: false,
    httpStatus: 403,
    code: "not_enrolled",
    reason: "您未被分配到该课次",
  };
}
