import { prisma } from "@/lib/db";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";

export type EffectiveSessionTeacher = {
  userId: string;
  displayName: string;
  avatar: string;
  role: "teacher" | "assistant";
  source: "course" | "session";
};

export type EffectiveSessionStudent = {
  userId: string;
  displayName: string;
  avatar: string;
  source: "course" | "group" | "session";
  groupIds: string[];
  temporary: boolean;
};

export type EffectiveSessionRoster = {
  sessionId: string;
  courseId: string;
  teacherMode: "inherit" | "custom";
  studentMode: "inherit" | "custom";
  leadTeacherId: string;
  teachers: EffectiveSessionTeacher[];
  students: EffectiveSessionStudent[];
};

function identityKey(value: string): string {
  const candidates = casdoorUserIdCandidates(value);
  return (candidates.at(-1) || value).trim().toLowerCase();
}

export async function resolveCourseSessionReference(referenceId: string) {
  const direct = await prisma.courseSession.findUnique({
    where: { id: referenceId },
  });
  if (direct) return direct;

  // A course is a container for many independent classrooms. Legacy callers
  // may still provide a course ID, so select the lesson a user can reasonably
  // enter now instead of always returning lesson #1 (which is often already
  // finished after a series has started).
  const live = await prisma.courseSession.findFirst({
    where: {
      courseId: referenceId,
      status: { in: ["live", "afterClass"] },
    },
    orderBy: [{ startTime: "asc" }, { position: "asc" }],
  });
  if (live) return live;

  const upcoming = await prisma.courseSession.findFirst({
    where: {
      courseId: referenceId,
      status: "scheduled",
      endTime: { gte: new Date() },
    },
    orderBy: [{ startTime: "asc" }, { position: "asc" }],
  });
  if (upcoming) return upcoming;

  return prisma.courseSession.findFirst({
    where: { courseId: referenceId },
    orderBy: [{ startTime: "desc" }, { position: "desc" }],
  });
}

export async function getEffectiveSessionRoster(
  sessionId: string,
): Promise<EffectiveSessionRoster | null> {
  const session = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    include: {
      course: {
        include: {
          teachers: { orderBy: { createdAt: "asc" } },
          students: { orderBy: { joinedAt: "asc" } },
          groupLinks: {
            include: {
              group: {
                include: { members: { orderBy: { joinedAt: "asc" } } },
              },
            },
          },
        },
      },
      teachers: { orderBy: { createdAt: "asc" } },
      students: { orderBy: { createdAt: "asc" } },
      groupLinks: {
        include: {
          group: {
            include: { members: { orderBy: { joinedAt: "asc" } } },
          },
        },
      },
    },
  });
  if (!session) return null;

  const teacherMode = session.teacherMode === "custom" ? "custom" : "inherit";
  const studentMode = session.studentMode === "custom" ? "custom" : "inherit";
  const teacherMap = new Map<string, EffectiveSessionTeacher>();
  const studentMap = new Map<string, EffectiveSessionStudent>();

  if (teacherMode === "inherit") {
    const courseTeachers = session.course.teachers.length
      ? session.course.teachers
      : [
          {
            teacherId: session.course.teacherId,
            teacherName: session.course.teacherName,
            teacherAvatar: session.course.teacherAvatar,
          },
        ];
    for (const teacher of courseTeachers) {
      teacherMap.set(identityKey(teacher.teacherId), {
        userId: teacher.teacherId,
        displayName: teacher.teacherName || teacher.teacherId,
        avatar: teacher.teacherAvatar,
        role: "assistant",
        source: "course",
      });
    }
  }

  for (const rule of session.teachers) {
    const key = identityKey(rule.teacherId);
    if (rule.action === "exclude") {
      teacherMap.delete(key);
      continue;
    }
    teacherMap.set(key, {
      userId: rule.teacherId,
      displayName: rule.teacherName || rule.teacherId,
      avatar: rule.teacherAvatar,
      role: rule.role === "teacher" ? "teacher" : "assistant",
      source: "session",
    });
  }

  if (studentMode === "inherit") {
    for (const student of session.course.students) {
      studentMap.set(identityKey(student.studentId), {
        userId: student.studentId,
        displayName: student.studentName || student.studentId,
        avatar: student.studentAvatar,
        source: "course",
        groupIds: [],
        temporary: false,
      });
    }
    for (const link of session.course.groupLinks) {
      for (const member of link.group.members) {
        const key = identityKey(member.userId);
        const existing = studentMap.get(key);
        studentMap.set(key, {
          userId: member.userId,
          displayName: member.userName || member.userId,
          avatar: member.userAvatar,
          source: existing?.source === "course" ? "course" : "group",
          groupIds: Array.from(new Set([...(existing?.groupIds || []), link.groupId])),
          temporary: false,
        });
      }
    }
  }

  for (const rule of session.groupLinks) {
    for (const member of rule.group.members) {
      const key = identityKey(member.userId);
      if (rule.action === "exclude") {
        studentMap.delete(key);
        continue;
      }
      const existing = studentMap.get(key);
      studentMap.set(key, {
        userId: member.userId,
        displayName: member.userName || member.userId,
        avatar: member.userAvatar,
        source: existing?.source === "course" ? "course" : "group",
        groupIds: Array.from(new Set([...(existing?.groupIds || []), rule.groupId])),
        temporary: studentMode === "custom" || !existing,
      });
    }
  }

  for (const rule of session.students) {
    const key = identityKey(rule.studentId);
    if (rule.action === "exclude") {
      studentMap.delete(key);
      continue;
    }
    studentMap.set(key, {
      userId: rule.studentId,
      displayName: rule.studentName || rule.studentId,
      avatar: rule.studentAvatar,
      source: "session",
      groupIds: [],
      temporary: true,
    });
  }

  const teachers = Array.from(teacherMap.values());
  const requestedLead = session.leadTeacherId
    ? teacherMap.get(identityKey(session.leadTeacherId))
    : null;
  const courseLead = teacherMap.get(identityKey(session.course.teacherId));
  const lead = requestedLead || courseLead || teachers[0];
  if (!lead) {
    return {
      sessionId: session.id,
      courseId: session.courseId,
      teacherMode,
      studentMode,
      leadTeacherId: "",
      teachers: [],
      students: Array.from(studentMap.values()),
    };
  }
  for (const teacher of teachers) {
    teacher.role = identityKey(teacher.userId) === identityKey(lead.userId)
      ? "teacher"
      : "assistant";
  }

  return {
    sessionId: session.id,
    courseId: session.courseId,
    teacherMode,
    studentMode,
    leadTeacherId: lead.userId,
    teachers,
    students: Array.from(studentMap.values()),
  };
}

export function rosterContainsUser(
  roster: EffectiveSessionRoster,
  userIds: readonly string[],
) {
  const keys = new Set(userIds.map(identityKey));
  const teacher = roster.teachers.find((item) => keys.has(identityKey(item.userId)));
  if (teacher) return { kind: "teacher" as const, member: teacher };
  const student = roster.students.find((item) => keys.has(identityKey(item.userId)));
  if (student) return { kind: "student" as const, member: student };
  return null;
}
