import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import type { CourseAccessDeniedCode } from "@/lib/access-denied-codes";
import { promoteCourseIfDueById } from "@/lib/course-promote";
import { canEnterClassroom, CourseStatus } from "@/lib/course-status";
import { prisma } from "@/lib/db";

export type CourseGateRole = "teacher" | "student";

export type CourseAccessDenied = {
  ok: false;
  httpStatus: number;
  reason: string;
  code: CourseAccessDeniedCode;
};

export type CourseAccessOk = {
  ok: true;
  role: CourseGateRole;
  roomType: number;
  roomName: string;
  teacherName: string;
};

export type CourseAccessResult = CourseAccessOk | CourseAccessDenied;

/**
 * Resolve whether a user may access a course (teacher, enrolled student, or via linked group).
 */
export async function resolveCourseAccess(
  courseId: string,
  userId: string
): Promise<CourseAccessResult> {
  try {
    let course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
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

    if (casdoorUserIdsMatch(course.teacherId, userId)) {
      return {
        ok: true,
        role: "teacher",
        roomType: course.roomType,
        roomName: course.name,
        teacherName: course.teacherName,
      };
    }

    const isDirectStudent = course.students.some((s) =>
      casdoorUserIdsMatch(s.studentId, userId)
    );
    if (isDirectStudent) {
      return {
        ok: true,
        role: "student",
        roomType: course.roomType,
        roomName: course.name,
        teacherName: course.teacherName,
      };
    }

    const allGroupMemberIds = new Set<string>();
    for (const link of course.groupLinks) {
      for (const member of link.group.members) {
        allGroupMemberIds.add(member.userId);
      }
    }

    const inGroup = [...allGroupMemberIds].some((mid) =>
      casdoorUserIdsMatch(mid, userId)
    );
    if (inGroup) {
      return {
        ok: true,
        role: "student",
        roomType: course.roomType,
        roomName: course.name,
        teacherName: course.teacherName,
      };
    }

    if (course.roomType === 10 && !course.passcode) {
      return {
        ok: true,
        role: "student",
        roomType: course.roomType,
        roomName: course.name,
        teacherName: course.teacherName,
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

/** Room id passed to Agora — must match this or token/launch is rejected. */
export function courseIdToRoomUuid(courseId: string): string {
  return courseId.replace(/-/g, "").slice(0, 16);
}
