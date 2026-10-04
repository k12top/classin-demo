import "server-only";
import { prisma } from "./db";
import type { SessionPayload } from "./session";
import { casdoorUserIdCandidates } from "./course-teacher";
import { getEffectiveSessionRoster, rosterContainsUser } from "./course-session-roster";
import { clearCourseSessionAccessCache } from "./course-session-access";
import { buildLessonPlaybackPath, joinLessonHasEnded } from "./join-link-routing";

// Call only after checking the live share link and any required passcode.
// Access is granted to this lesson, without enrolling the viewer in all lessons.
export async function resolveJoinLinkPlayback(lesson: {
  id: string; courseId: string; status: string; endedAt: Date | null; endTime: Date;
}, identity: Pick<SessionPayload, "userId" | "name" | "displayName" | "avatar">,
options: { embed?: boolean; lang?: string; parentOrigin?: string } = {}) {
  const runtime = await prisma.classroomRuntime.findUnique({
    where: { sessionId: lesson.id }, select: { status: true },
  });
  if (!joinLessonHasEnded(lesson, runtime?.status)) return null;
  const roster = await getEffectiveSessionRoster(lesson.id);
  if (!roster) return null;
  const aliases = [identity.userId, identity.name || ""].flatMap(casdoorUserIdCandidates);
  if (!rosterContainsUser(roster, aliases)) {
    await prisma.courseSessionStudent.upsert({
      where: { sessionId_studentId: { sessionId: lesson.id, studentId: identity.userId } },
      create: {
        courseId: lesson.courseId, sessionId: lesson.id, studentId: identity.userId,
        studentName: identity.displayName || identity.name || identity.userId,
        studentAvatar: identity.avatar || "", action: "include",
      },
      update: {
        studentName: identity.displayName || identity.name || identity.userId,
        studentAvatar: identity.avatar || "", action: "include",
      },
    });
    clearCourseSessionAccessCache();
  }
  return buildLessonPlaybackPath(lesson.courseId, lesson.id, options);
}
