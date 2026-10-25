import { getEffectiveSessionRoster } from "@/lib/course-session-roster";
import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/session";

type UploadIdentity = Pick<SessionPayload, "userId" | "name" | "role">;
type TeachingCourse = {
  ownerId?: string | null;
  teacherId: string;
  teachers?: readonly { teacherId: string }[];
};

export const COURSEWARE_UPLOAD_FORBIDDEN = "COURSEWARE_UPLOAD_FORBIDDEN";

/** Use signed login identities, never display names, and preserve organization boundaries. */
export function canUploadCoursewareForCourse(
  session: UploadIdentity,
  course: TeachingCourse,
  organization = process.env.NEXT_PUBLIC_CASDOOR_ORG_NAME?.trim() || "",
): boolean {
  if (session.role !== "teacher") return false;
  const identities = [session.userId, session.name].map(value => value?.trim()).filter(Boolean);
  const qualified = identities.filter(value => value.includes("/"));
  const identityOrganizations = new Set(qualified.map(value => value.slice(0, value.indexOf("/"))));
  if (identityOrganizations.size > 1) return false;
  const identityOrganization = identityOrganizations.values().next().value as string | undefined;
  if (organization && identityOrganization && organization !== identityOrganization) return false;
  const expectedOrganization = organization || identityOrganization;
  const localIdentities = new Set(identities.map(value => value.includes("/") ? value.slice(value.indexOf("/") + 1) : value));
  const assignments = [course.ownerId || course.teacherId, course.teacherId, ...(course.teachers || []).map(teacher => teacher.teacherId)];
  return assignments.some(raw => {
    const assignment = raw.trim();
    const slash = assignment.indexOf("/");
    if (slash < 0) return localIdentities.has(assignment);
    // A bare login name must not match another organization's qualified record.
    if (!expectedOrganization || assignment.slice(0, slash) !== expectedOrganization) return false;
    return localIdentities.has(assignment.slice(slash + 1));
  });
}

export async function assertCanUploadCourseware(session: UploadIdentity, courseId: string, sessionId?: string | null): Promise<boolean> {
  if (session.role !== "teacher") return false;
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { ownerId: true, teacherId: true, teachers: { select: { teacherId: true } } },
  });
  if (!course) return false;
  if (!sessionId) return canUploadCoursewareForCourse(session, course);
  const lesson = await prisma.courseSession.findFirst({ where: { id: sessionId, courseId }, select: { id: true } });
  if (!lesson) return false;
  if (canUploadCoursewareForCourse(session, course)) return true;
  const roster = await getEffectiveSessionRoster(lesson.id);
  return Boolean(roster && canUploadCoursewareForCourse(session, {
    teacherId: "", teachers: roster.teachers.map(teacher => ({ teacherId: teacher.userId })),
  }));
}
