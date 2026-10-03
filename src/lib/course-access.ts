import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import type { CourseAccessDeniedCode } from "@/lib/access-denied-codes";
import type { ClassroomAccessRole } from "@/lib/agora-classroom-role";
import { promoteCourseIfDueById } from "@/lib/course-promote";
import {
  canEnterClassroom,
  courseNotStartedReason,
  CourseStatus,
  getEarlyClassroomEntryMinutes,
  isTooEarlyToEnterClassroom,
} from "@/lib/course-status";
import { prisma } from "@/lib/db";
import { userCanTeachCourse } from "@/lib/course-teacher";
import { verifyShareAccessToken } from "@/lib/join-link";
import { courseIdToRoomUuid } from "@/lib/course-room";

export { courseIdToRoomUuid } from "@/lib/course-room";

export type CourseAccessDenied = {
  ok: false;
  httpStatus: number;
  reason: string;
  code: CourseAccessDeniedCode;
};

export type CourseAccessOk = {
  ok: true;
  role: ClassroomAccessRole;
  roomType: number;
  roomUuid: string;
  roomName: string;
  teacherName: string;
  startTime: Date | null;
  endTime: Date | null;
};

export type CourseAccessResult = CourseAccessOk | CourseAccessDenied;

/**
 * Resolve whether a user may access a course (teacher, enrolled student, or via linked group).
 */
export async function resolveCourseAccess(
  courseId: string,
  userId: string,
  options: {
    shareAccessToken?: string | null;
    userIdAliases?: readonly string[];
  } = {}
): Promise<CourseAccessResult> {
  try {
    const userIdCandidates = Array.from(
      new Set(
        [userId, ...(options.userIdAliases ?? [])]
          .map((candidate) => candidate.trim())
          .filter(Boolean)
      )
    );
    let course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        teachers: { select: { teacherId: true } },
        students: { select: { studentId: true } },
        groupLinks: {
          include: {
            group: {
              include: {
                members: { select: { userId: true } },
              },
            },
          },
        },
      },
    });

    if (!course) {
      return {
        ok: false,
        httpStatus: 404,
        reason: "课程不存在",
        code: "not_found",
      };
    }

    await promoteCourseIfDueById(courseId);
    const refreshed = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        teachers: { select: { teacherId: true } },
        students: { select: { studentId: true } },
        groupLinks: {
          include: {
            group: {
              include: {
                members: { select: { userId: true } },
              },
            },
          },
        },
      },
    });
    if (refreshed) {
      course = refreshed;
    }

    if (!canEnterClassroom(course.status)) {
      if (course.status === CourseStatus.CANCELLED) {
        return {
          ok: false,
          httpStatus: 403,
          reason: "课程已取消",
          code: "course_cancelled",
        };
      }
      return {
        ok: false,
        httpStatus: 403,
        reason: "课程已结束",
        code: "course_finished",
      };
    }

    const earlyMinutes = getEarlyClassroomEntryMinutes();
    if (isTooEarlyToEnterClassroom(course.startTime, new Date(), earlyMinutes)) {
      return {
        ok: false,
        httpStatus: 403,
        reason: courseNotStartedReason(earlyMinutes),
        code: "course_not_started",
      };
    }

    if (userCanTeachCourse(course, userIdCandidates)) {
      return {
        ok: true,
        role: userIdCandidates.some((candidate) =>
          casdoorUserIdsMatch(course.teacherId, candidate)
        )
          ? "teacher"
          : "assistant",
        roomType: course.roomType,
        roomUuid: courseIdToRoomUuid(course.id, course.roomUuid),
        roomName: course.name,
        teacherName: course.teacherName,
        startTime: course.startTime,
        endTime: course.endTime,
      };
    }

    const isDirectStudent = course.students.some((s) =>
      userIdCandidates.some((candidate) =>
        casdoorUserIdsMatch(s.studentId, candidate)
      )
    );
    if (isDirectStudent) {
      return {
        ok: true,
        role: "student",
        roomType: course.roomType,
        roomUuid: courseIdToRoomUuid(course.id, course.roomUuid),
        roomName: course.name,
        teacherName: course.teacherName,
        startTime: course.startTime,
        endTime: course.endTime,
      };
    }

    const allGroupMemberIds = new Set<string>();
    for (const link of course.groupLinks) {
      for (const member of link.group.members) {
        allGroupMemberIds.add(member.userId);
      }
    }

    const inGroup = [...allGroupMemberIds].some((mid) =>
      userIdCandidates.some((candidate) =>
        casdoorUserIdsMatch(mid, candidate)
      )
    );
    if (inGroup) {
      return {
        ok: true,
        role: "student",
        roomType: course.roomType,
        roomUuid: courseIdToRoomUuid(course.id, course.roomUuid),
        roomName: course.name,
        teacherName: course.teacherName,
        startTime: course.startTime,
        endTime: course.endTime,
      };
    }

    const shareAccess = await verifyShareAccessToken(options.shareAccessToken, {
      userId,
      courseId,
    });
    if (shareAccess.ok) {
      return {
        ok: true,
        role: "student",
        roomType: course.roomType,
        roomUuid: courseIdToRoomUuid(course.id, course.roomUuid),
        roomName: course.name,
        teacherName: course.teacherName,
        startTime: course.startTime,
        endTime: course.endTime,
      };
    }

    if (course.roomType === 10 && !course.passcode) {
      return {
        ok: true,
        role: "student",
        roomType: course.roomType,
        roomUuid: courseIdToRoomUuid(course.id, course.roomUuid),
        roomName: course.name,
        teacherName: course.teacherName,
        startTime: course.startTime,
        endTime: course.endTime,
      };
    }

    return {
      ok: false,
      httpStatus: 403,
      reason: "您未被分配到此课程，请联系老师获取访问权限",
      code: "not_enrolled",
    };
  } catch (error) {
    console.error("resolveCourseAccess:", error);
    return {
      ok: false,
      httpStatus: 500,
      reason: "验证失败",
      code: "default",
    };
  }
}
