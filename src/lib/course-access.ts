import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { prisma } from "@/lib/db";

export type CourseGateRole = "teacher" | "student";

export type CourseAccessDenied = {
  ok: false;
  httpStatus: number;
  reason: string;
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
    const course = await prisma.course.findUnique({
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
      return { ok: false, httpStatus: 404, reason: "课程不存在" };
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

    return {
      ok: false,
      httpStatus: 403,
      reason: "您未被分配到此课程，请联系老师获取访问权限",
    };
  } catch (error) {
    console.error("resolveCourseAccess:", error);
    return { ok: false, httpStatus: 500, reason: "验证失败" };
  }
}

/** Room id passed to Agora — must match this or token/launch is rejected. */
export function courseIdToRoomUuid(courseId: string): string {
  return courseId.replace(/-/g, "").slice(0, 16);
}
