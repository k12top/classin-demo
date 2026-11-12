import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";
import { getFinishedDelayMinutes } from "@/lib/course-status";

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

export type EffectiveSessionObserver = {
  userId: string;
  displayName: string;
  avatar: string;
  source: "session";
};

export type EffectiveSessionRoster = {
  sessionId: string;
  courseId: string;
  teacherMode: "inherit" | "custom";
  studentMode: "inherit" | "custom";
  leadTeacherId: string;
  teachers: EffectiveSessionTeacher[];
  students: EffectiveSessionStudent[];
  observers: EffectiveSessionObserver[];
};

function identityKey(value: string): string {
  const candidates = casdoorUserIdCandidates(value);
  return (candidates.at(-1) || value).trim().toLowerCase();
}

export type CourseSessionReferenceType = "course" | "session" | "auto";

export async function resolveCourseSessionReference(
  referenceId: string,
  referenceType: CourseSessionReferenceType = "auto",
) {
  // Migrated first lessons reuse their course ID. A known course entry must
  // select the current lesson; an explicit session must keep its exact target.
  if (referenceType !== "course") {
    const direct = await prisma.courseSession.findUnique({
      where: { id: referenceId },
    });
    if (direct || referenceType === "session") return direct;
  }

  // A course is a container for many independent classrooms. Legacy callers
  // may still provide a course ID, so select the lesson a user can reasonably
  // enter now instead of always returning lesson #1 (which is often already
  // finished after a series has started).
  const now = new Date();
  const live = await prisma.courseSession.findFirst({
    where: {
      courseId: referenceId,
      status: { in: ["scheduled", "live", "afterClass"] },
      endedAt: null,
      startTime: { lte: now },
      endTime: { gt: new Date(now.getTime() - getFinishedDelayMinutes() * 60_000) },
    },
    orderBy: [{ startTime: "desc" }, { position: "desc" }],
  });
  if (live) return live;

  const upcoming = await prisma.courseSession.findFirst({
    where: {
      courseId: referenceId,
      status: "scheduled",
      endedAt: null,
      endTime: { gte: now },
    },
    orderBy: [{ startTime: "asc" }, { position: "asc" }],
  });
  if (upcoming) return upcoming;

  return prisma.courseSession.findFirst({
    where: { courseId: referenceId },
    orderBy: [{ startTime: "desc" }, { position: "desc" }],
  });
}

const rosterInclude = {
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
      teachers: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      students: { orderBy: { createdAt: "asc" } },
      groupLinks: {
        include: {
          group: {
            include: { members: { orderBy: { joinedAt: "asc" } } },
          },
        },
      },
    } satisfies Prisma.CourseSessionInclude;
type SessionWithRoster = Prisma.CourseSessionGetPayload<{include:typeof rosterInclude}>;

/** Load the exact lesson and its roster together for classroom authorization. */
export async function getCourseSessionWithRoster(sessionId: string) {
  const session = await prisma.courseSession.findUnique({where:{id:sessionId},include:rosterInclude});
  return session ? {session, roster:buildEffectiveSessionRoster(session)} : null;
}

export async function getEffectiveSessionRoster(
  sessionId: string,
  client: Pick<Prisma.TransactionClient, "courseSession"> = prisma,
): Promise<EffectiveSessionRoster | null> {
  const session = await client.courseSession.findUnique({where:{id:sessionId},include:rosterInclude});
  return session ? buildEffectiveSessionRoster(session) : null;
}

/** Check just the explicit staff rules while the caller holds the lesson lock. */
export async function getSessionObserverStatus(
  sessionId:string,
  userIds:readonly string[],
  client:Pick<Prisma.TransactionClient,"courseSession"> = prisma,
):Promise<boolean|null> {
  const session=await client.courseSession.findUnique({where:{id:sessionId},select:{teachers:{select:{teacherId:true,action:true,role:true},orderBy:[{createdAt:"asc"},{id:"asc"}]}}});
  if(!session)return null;
  const keys=new Set(userIds.map(identityKey));
  const rules=new Map<string,boolean>();
  for(const rule of session.teachers){
    const key=identityKey(rule.teacherId);
    if(keys.has(key))rules.set(key,rule.action!=="exclude"&&rule.role==="observer");
  }
  return [...rules.values()].some(Boolean);
}

/** Bulk-load the same roster shape; callers bound the number of IDs per batch. */
export async function getEffectiveSessionRosters(
  sessionIds: readonly string[],
  client: Pick<Prisma.TransactionClient, "courseSession"> = prisma,
): Promise<EffectiveSessionRoster[]> {
  if (!sessionIds.length) return [];
  const sessions = await client.courseSession.findMany({where:{id:{in:[...sessionIds]}},include:rosterInclude});
  return sessions.map(buildEffectiveSessionRoster);
}

/** A transaction owns one pg connection. Prisma may issue relation includes in
 * parallel on that connection, so read the same roster tables sequentially. */
export async function getEffectiveSessionRostersSequential(sessionIds:readonly string[],client:Prisma.TransactionClient):Promise<EffectiveSessionRoster[]> {
  if(!sessionIds.length)return [];
  const sessions=await client.courseSession.findMany({where:{id:{in:[...sessionIds]}}});
  if(!sessions.length)return [];
  const courseIds=[...new Set(sessions.map(session=>session.courseId))],ids=sessions.map(session=>session.id);
  const courses=await client.course.findMany({where:{id:{in:courseIds}}});
  const teachers=await client.courseTeacher.findMany({where:{courseId:{in:courseIds}},orderBy:{createdAt:"asc"}});
  const students=await client.courseStudent.findMany({where:{courseId:{in:courseIds}},orderBy:{joinedAt:"asc"}});
  const courseGroups=await client.courseGroupLink.findMany({where:{courseId:{in:courseIds}}});
  const sessionTeachers=await client.courseSessionTeacher.findMany({where:{sessionId:{in:ids}},orderBy:[{createdAt:"asc"},{id:"asc"}]});
  const sessionStudents=await client.courseSessionStudent.findMany({where:{sessionId:{in:ids}},orderBy:{createdAt:"asc"}});
  const sessionGroups=await client.courseSessionGroupLink.findMany({where:{sessionId:{in:ids}}});
  const groupIds=[...new Set([...courseGroups,...sessionGroups].map(link=>link.groupId))];
  const groups=groupIds.length?await client.studentGroup.findMany({where:{id:{in:groupIds}}}):[];
  const members=groupIds.length?await client.groupMember.findMany({where:{groupId:{in:groupIds}},orderBy:{joinedAt:"asc"}}):[];
  const groupMap=new Map(groups.map(group=>[group.id,{...group,members:members.filter(member=>member.groupId===group.id)}]));
  const withGroup=<T extends {groupId:string}>(links:T[])=>links.map(link=>{const group=groupMap.get(link.groupId);if(!group)throw new Error("Roster group unavailable");return {...link,group};});
  const courseMap=new Map(courses.map(course=>[course.id,{...course,teachers:teachers.filter(row=>row.courseId===course.id),students:students.filter(row=>row.courseId===course.id),groupLinks:withGroup(courseGroups.filter(row=>row.courseId===course.id))}]));
  return sessions.map(session=>{const course=courseMap.get(session.courseId);if(!course)throw new Error("Roster course unavailable");return buildEffectiveSessionRoster({...session,course,teachers:sessionTeachers.filter(row=>row.sessionId===session.id),students:sessionStudents.filter(row=>row.sessionId===session.id),groupLinks:withGroup(sessionGroups.filter(row=>row.sessionId===session.id))});});
}

function buildEffectiveSessionRoster(session: SessionWithRoster): EffectiveSessionRoster {
  const teacherMode = session.teacherMode === "custom" ? "custom" : "inherit";
  const studentMode = session.studentMode === "custom" ? "custom" : "inherit";
  const teacherMap = new Map<string, EffectiveSessionTeacher>();
  const studentMap = new Map<string, EffectiveSessionStudent>();
  const observerMap = new Map<string, EffectiveSessionObserver>();

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
      observerMap.delete(key);
      continue;
    }
    if (rule.role === "observer") {
      teacherMap.delete(key);
      observerMap.set(key, { userId: rule.teacherId, displayName: rule.teacherName || rule.teacherId, avatar: rule.teacherAvatar, source: "session" });
      continue;
    }
    observerMap.delete(key);
    if (rule.role !== "teacher" && rule.role !== "assistant") {
      teacherMap.delete(key);
      continue;
    }
    teacherMap.set(key, {
      userId: rule.teacherId,
      displayName: rule.teacherName || rule.teacherId,
      avatar: rule.teacherAvatar,
      role: rule.role,
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

  for (const key of observerMap.keys()) studentMap.delete(key);

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
      observers: Array.from(observerMap.values()),
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
    observers: Array.from(observerMap.values()),
  };
}

export function rosterHasObserver(roster: EffectiveSessionRoster, userIds: readonly string[]) {
  const keys = new Set(userIds.map(identityKey));
  return (roster.observers || []).some((item) => keys.has(identityKey(item.userId)));
}

export function rosterContainsUser(
  roster: EffectiveSessionRoster,
  userIds: readonly string[],
) {
  const keys = new Set(userIds.map(identityKey));
  // An explicit observer rule overrides inherited teaching/student roles.
  if (rosterHasObserver(roster, userIds)) return null;
  const teacher = roster.teachers.find((item) => keys.has(identityKey(item.userId)));
  if (teacher) return { kind: "teacher" as const, member: teacher };
  const student = roster.students.find((item) => keys.has(identityKey(item.userId)));
  if (student) return { kind: "student" as const, member: student };
  return null;
}
