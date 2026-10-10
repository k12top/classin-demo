import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { createClassroomAssistantHandler } from "@/lib/classroom/server/assistant";

export const runtime = "nodejs";
export const maxDuration = 60;
const handle = createClassroomAssistantHandler({
  authorize: async (request, referenceId, shareAccess) => {
    const result = await resolveClassroomRequestAccess(request as NextRequest, referenceId, shareAccess);
    return result.ok ? { ok: true, userId: result.session.userId, courseId: result.access.courseId, sessionId: result.access.sessionId } : result;
  },
  context: async (courseId, sessionId) => {
    const [lesson, captions] = await Promise.all([
      prisma.courseSession.findFirst({ where: { id: sessionId, courseId }, select: { title: true, leadTeacherName: true, course: { select: { name: true, description: true } } } }),
      prisma.classroomCaption.findMany({ where: { sessionId, courseId, isFinal: true }, orderBy: { occurredAt: "desc" }, take: 40, select: { speakerName: true, text: true } }),
    ]);
    return lesson ? { title: lesson.title || lesson.course.name, description: lesson.course.description, teacherName: lesson.leadTeacherName, captions: captions.reverse() } : null;
  },
});
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  return handle(request, (await params).sessionId);
}
