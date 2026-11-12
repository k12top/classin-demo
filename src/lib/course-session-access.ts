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
  getCourseSessionWithRoster,
  resolveCourseSessionReference,
  rosterContainsUser,
  rosterHasObserver,
  type CourseSessionReferenceType,
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
    (Boolean(lesson.endedAt) || lesson.endTime <= finishThreshold);
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
      teacherId: string;
      teacherAvatar: string;
      startTime: Date;
      endTime: Date;
    }
  | {
      ok: false;
      httpStatus: number;
      code: string;
      reason: string;
      courseId?: string;
    };

// Kept for existing lifecycle callers; authorization is no longer cached.
export function clearCourseSessionAccessCache() {
}

export async function resolveCourseSessionAccess(
  referenceId: string,
  userId: string,
  options: {
    userIdAliases?: readonly string[];
    shareAccessToken?: string | null;
    referenceType?: CourseSessionReferenceType;
    skipCache?: boolean;
    purpose?: "classroom" | "activities";
  } = {},
): Promise<CourseSessionAccessResult> {
  // In-process TTL caches cannot observe roster changes made by another
  // server. The caller may coalesce simultaneous reads, but every later
  // request must revalidate access against the current roster.
  return resolveCourseSessionAccessUncached(referenceId, userId, options);
}

async function resolveCourseSessionAccessUncached(
  referenceId: string,
  userId: string,
  options: {
    userIdAliases?: readonly string[];
    shareAccessToken?: string | null;
    referenceType?: CourseSessionReferenceType;
    purpose?: "classroom" | "activities";
  },
): Promise<CourseSessionAccessResult> {
  const exact = options.referenceType === "session" ? await getCourseSessionWithRoster(referenceId) : null;
  const initial = options.referenceType === "session" ? exact?.session : await resolveCourseSessionReference(referenceId, options.referenceType);
  if (!initial) {
    return { ok: false, httpStatus: 404, code: "not_found", reason: "课次不存在" };
  }
  const lesson = await promoteCourseSessionIfDue(initial);
  if (!lesson) {
    return { ok: false, httpStatus: 404, code: "not_found", reason: "课次不存在" };
  }
  // Activity records outlive classroom admission. Roster/share authorization
  // below still applies; activity services separately enforce live writes.
  const classroomEntry = options.purpose !== "activities";
  if (!canEnterClassroom(lesson.status) && (classroomEntry || lesson.status !== CourseStatus.FINISHED)) {
    return {
      ok: false,
      httpStatus: 403,
      code: lesson.status === CourseStatus.CANCELLED ? "course_cancelled" : "course_finished",
      reason: lesson.status === CourseStatus.CANCELLED ? "课次已取消" : "课次已结束",
      courseId: lesson.courseId,
    };
  }
  const earlyMinutes = getEarlyClassroomEntryMinutes();
  if (classroomEntry && isTooEarlyToEnterClassroom(lesson.startTime, new Date(), earlyMinutes)) {
    return {
      ok: false,
      httpStatus: 403,
      code: "course_not_started",
      reason: courseNotStartedReason(earlyMinutes),
      courseId: lesson.courseId,
    };
  }
  const roster = exact?.roster || await getEffectiveSessionRoster(lesson.id);
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
  // An observer must never fall through to a share link or public-student role.
  if (rosterHasObserver(roster, candidates)) {
    if (classroomEntry) {
      const identifiers=Array.from(new Set(candidates.map(value=>value.split("/").at(-1)!).filter(Boolean)));
      const previous=await prisma.classroomMemberState.findFirst({where:{sessionId:lesson.id,role:{not:"observer"},OR:identifiers.flatMap(id=>[{userId:{equals:id,mode:"insensitive" as const}},{userId:{endsWith:`/${id}`,mode:"insensitive" as const}}])},select:{id:true}});
      if(previous)return {ok:false,httpStatus:403,code:"observer_previous_participant",reason:"您曾以其他身份进入此课节，无法安全切换为旁听",courseId:lesson.courseId};
    }
    const lead = roster.teachers.find((teacher) => teacher.userId === roster.leadTeacherId)!;
    return {ok:true,role:"observer",temporary:false,courseId:lesson.courseId,sessionId:lesson.id,
      roomUuid:lesson.roomUuid,roomName:lesson.title,roomType:lesson.roomType,teacherName:lead.displayName,
      teacherId:lead.userId,teacherAvatar:lead.avatar,startTime:lesson.startTime,endTime:lesson.endTime};
  }
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
      teacherId: lead.userId,
      teacherAvatar: lead.avatar,
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
      teacherId: lead.userId,
      teacherAvatar: lead.avatar,
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
      teacherId: lead.userId,
      teacherAvatar: lead.avatar,
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
        teacherId: lead.userId,
        teacherAvatar: lead.avatar,
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
