import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { prisma } from "@/lib/db";

export type CourseTeacherInput = {
  teacherId?: string;
  id?: string;
  casdoorUuid?: string | null;
  teacherName?: string;
  displayName?: string;
  name?: string;
  teacherAvatar?: string;
  avatar?: string;
};

export type NormalizedCourseTeacher = {
  teacherId: string;
  teacherName: string;
  teacherAvatar: string;
};

type CourseTeacherLike = {
  teacherId: string;
};

type CoursePermissionLike = {
  ownerId?: string | null;
  teacherId: string;
  teachers?: CourseTeacherLike[];
};

export function casdoorUserIdCandidates(userId: string): string[] {
  const trimmed = userId.trim();
  if (!trimmed) return [];
  const stripped = trimmed.includes("/") ? trimmed.split("/").pop()! : trimmed;
  return Array.from(new Set([trimmed, stripped].filter(Boolean)));
}

export function userOwnsCourse(
  course: { ownerId?: string | null; teacherId: string },
  userId: string
): boolean {
  const ownerId = course.ownerId || course.teacherId;
  return casdoorUserIdsMatch(ownerId, userId);
}

export function userCanTeachCourse(
  course: CoursePermissionLike,
  userId: string
): boolean {
  if (userOwnsCourse(course, userId)) return true;
  if (casdoorUserIdsMatch(course.teacherId, userId)) return true;
  return Boolean(
    course.teachers?.some((teacher) =>
      casdoorUserIdsMatch(teacher.teacherId, userId)
    )
  );
}

export function normalizeCourseTeachers(
  primaryTeacher: CourseTeacherInput,
  teachers: CourseTeacherInput[] = []
): NormalizedCourseTeacher[] {
  const normalized: NormalizedCourseTeacher[] = [];

  const addTeacher = (input: CourseTeacherInput) => {
    const teacherId = (
      input.teacherId ||
      input.casdoorUuid ||
      input.id ||
      ""
    ).trim();
    if (!teacherId) return;

    const teacherName = (
      input.teacherName ||
      input.displayName ||
      input.name ||
      teacherId
    ).trim();
    const teacherAvatar = (input.teacherAvatar || input.avatar || "").trim();
    const existing = normalized.find((teacher) =>
      casdoorUserIdsMatch(teacher.teacherId, teacherId)
    );
    if (existing) {
      if (!existing.teacherName && teacherName) {
        existing.teacherName = teacherName;
      }
      if (!existing.teacherAvatar && teacherAvatar) {
        existing.teacherAvatar = teacherAvatar;
      }
      return;
    }

    normalized.push({
      teacherId,
      teacherName: teacherName || teacherId,
      teacherAvatar,
    });
  };

  addTeacher(primaryTeacher);
  for (const teacher of teachers) {
    addTeacher(teacher);
  }

  return normalized;
}

export async function assertCourseOwner(
  userId: string,
  courseId: string
): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { ownerId: true, teacherId: true },
  });
  return Boolean(course && userOwnsCourse(course, userId));
}

export async function assertTeacherOwnsCourse(
  userId: string,
  courseId: string
): Promise<boolean> {
  return assertCourseOwner(userId, courseId);
}

export async function assertCanTeachCourse(
  userId: string,
  courseId: string
): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      ownerId: true,
      teacherId: true,
      teachers: { select: { teacherId: true } },
    },
  });
  return Boolean(course && userCanTeachCourse(course, userId));
}
