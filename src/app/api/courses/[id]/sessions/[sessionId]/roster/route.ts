import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { assertCanTeachCourse, casdoorUserIdCandidates } from "@/lib/course-teacher";
import {
  getEffectiveSessionRoster,
  rosterContainsUser,
} from "@/lib/course-session-roster";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const auth = await getSessionFromRequest(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: courseId, sessionId } = await params;
  const roster = await getEffectiveSessionRoster(sessionId);
  if (!roster || roster.courseId !== courseId) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const canManage = auth.role === "teacher" &&
    (await assertCanTeachCourse(auth.userId, courseId));
  const aliases = [
    ...casdoorUserIdCandidates(auth.userId),
    ...casdoorUserIdCandidates(auth.name || ""),
  ];
  if (!canManage && !rosterContainsUser(roster, aliases)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ canManage, roster });
}
