import { NextRequest, NextResponse } from "next/server";
import { getClassroomServerProvider } from "@/lib/classroom/server/provider-factory";
import {
  ClassroomSpaceError,
  getClassroomSpaceCredentialAccess,
} from "@/lib/classroom/server/spaces";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as {
    spaceId?: unknown;
    shareAccess?: unknown;
  } | null;
  const spaceId = typeof body?.spaceId === "string" ? body.spaceId : "";
  if (!spaceId) {
    return NextResponse.json({ error: "缺少分组教室 ID" }, { status: 400 });
  }
  const resolved = await resolveClassroomRequestAccess(
    request,
    courseId,
    typeof body?.shareAccess === "string" ? body.shareAccess : null,
  );
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }
  try {
    const [space, course] = await Promise.all([
      getClassroomSpaceCredentialAccess({
        courseId,
        spaceId,
        viewerId: resolved.session.userId,
        role: resolved.access.role,
      }),
      prisma.course.findUnique({
        where: { id: courseId },
        select: { classroomProvider: true },
      }),
    ]);
    if (!course) throw new ClassroomSpaceError("课程不存在", 404);
    const credential = getClassroomServerProvider(
      course.classroomProvider,
    ).issueCredential({
      channelName: space.channelName,
      userId: resolved.session.userId,
      role: resolved.access.role,
      scenario: "communication",
      publisher: space.publisher,
      allowScreenShare: space.publisher && space.allowScreenShare,
    });
    if (space.membership) {
      await prisma.classroomSpaceMember.update({
        where: {
          spaceId_userId: { spaceId, userId: resolved.session.userId },
        },
        data: { joinedAt: new Date(), leftAt: null },
      });
    }
    return NextResponse.json({
      space: { id: space.id, name: space.name },
      credential,
    });
  } catch (error) {
    if (error instanceof ClassroomSpaceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[classroom:space-credential] failed", error);
    return NextResponse.json({ error: "无法进入分组教室" }, { status: 500 });
  }
}
