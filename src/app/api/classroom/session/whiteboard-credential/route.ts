import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { getWhiteboardProvider } from "@/lib/classroom/whiteboard/provider-factory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    courseId?: unknown;
    shareAccess?: unknown;
  } | null;
  const courseId =
    typeof body?.courseId === "string" ? body.courseId.trim() : "";
  if (!courseId) {
    return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  }

  const resolved = await resolveClassroomRequestAccess(
    request,
    courseId,
    typeof body?.shareAccess === "string" ? body.shareAccess : null,
  );
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const member = await prisma.classroomMemberState.findUnique({
    where: {
      courseId_userId: {
        courseId,
        userId: resolved.session.userId,
      },
    },
    select: { whiteboardWritable: true, onStage: true, stageState: true },
  });
  if (!member) {
    return NextResponse.json({ error: "课堂成员不存在" }, { status: 404 });
  }

  const teachingRole =
    resolved.access.role === "teacher" ||
    resolved.access.role === "assistant";
  const writable =
    teachingRole ||
    (member.whiteboardWritable &&
      member.onStage &&
      member.stageState === "accepted");
  const whiteboard = await getWhiteboardProvider().issueJoinCredential({
    courseId,
    userId: resolved.session.userId,
    role: resolved.access.role,
    writable,
  });

  return NextResponse.json(
    { whiteboard },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}
