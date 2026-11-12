import type { NextRequest } from "next/server";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { createClassroomAssistantHandler } from "@/lib/classroom/server/assistant";
import { loadClassroomAssistantContext } from "@/lib/classroom/server/assistant-context";

export const runtime = "nodejs";
export const maxDuration = 60;
const handle = createClassroomAssistantHandler({
  authorize: async (request, referenceId, shareAccess) => {
    const result = await resolveClassroomRequestAccess(request as NextRequest, referenceId, shareAccess);
    if (!result.ok) return result;
    if (result.access.role !== "teacher" && result.access.role !== "assistant" && result.access.role !== "student") return { ok: false, status: 403, code: "forbidden" };
    return { ok: true, userId: result.session.userId, courseId: result.access.courseId, sessionId: result.access.sessionId };
  },
  context: loadClassroomAssistantContext,
});
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  return handle(request, (await params).sessionId);
}
