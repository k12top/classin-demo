import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { isCoursewareAvailableInSession } from "@/lib/courseware-access";
import { coursewareFileResponse } from "@/lib/courseware-file-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string; coursewareId: string }> }) {
  const { sessionId, coursewareId } = await params;
  const access = await resolveClassroomRequestAccess(request, sessionId, request.nextUrl.searchParams.get("shareAccess"));
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const file = await prisma.courseware.findFirst({ where: { id: coursewareId, courseId: access.access.courseId } });
  const preview = request.nextUrl.searchParams.get("mode") === "preview";
  if (!file) return Response.json({ error: "not_found" }, { status: 404 });
  const teaching = access.access.role === "teacher" || access.access.role === "assistant";
  if (!await isCoursewareAvailableInSession(file, access.access.sessionId) || (!teaching && (!file.studentCanView || (!preview && !file.studentCanDownload)))) return Response.json({ error: "Forbidden" }, { status: 403 });
  try { return await coursewareFileResponse(file, preview); }
  catch { return Response.json({ error: "file_unavailable" }, { status: 502 }); }
}
