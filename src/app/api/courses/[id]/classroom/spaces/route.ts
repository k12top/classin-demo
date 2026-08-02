import { NextRequest, NextResponse } from "next/server";
import {
  assignClassroomSpaceMember,
  autoAssignClassroomSpaces,
  ClassroomSpaceError,
  createClassroomBreakouts,
  deleteClassroomBreakouts,
  getClassroomSpaces,
  updateClassroomSpace,
} from "@/lib/classroom/server/spaces";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { classroomModePolicy } from "@/lib/classroom/mode";
import { prisma } from "@/lib/db";
import { databaseUnavailableResponse } from "@/lib/database-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function resolveRequest(
  request: NextRequest,
  courseId: string,
  shareAccess?: string | null,
) {
  const resolved = await resolveClassroomRequestAccess(
    request,
    courseId,
    shareAccess,
  );
  if (!resolved.ok) return resolved;
  const lesson = await prisma.courseSession.findUnique({
    where: { id: resolved.access.sessionId },
    select: { roomType: true },
  });
  if (!lesson) {
    return {
      ok: false as const,
      status: 404,
      error: "课程不存在",
      code: "course_not_found",
    };
  }
  return { ...resolved, modePolicy: classroomModePolicy(lesson.roomType) };
}

async function resolveRequestOrDatabaseUnavailable(
  request: NextRequest,
  courseId: string,
  shareAccess?: string | null,
) {
  try {
    return await resolveRequest(request, courseId, shareAccess);
  } catch (error) {
    const unavailable = databaseUnavailableResponse(error);
    if (unavailable) return unavailable;
    throw error;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const resolved = await resolveRequestOrDatabaseUnavailable(
    request,
    courseId,
    request.nextUrl.searchParams.get("shareAccess"),
  );
  if (resolved instanceof NextResponse) return resolved;
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }
  if (!resolved.modePolicy.allowBreakouts) {
    return NextResponse.json({ enabled: false, spaces: [] });
  }
  const spaces = await getClassroomSpaces({
    courseId: resolved.access.courseId,
    sessionId: resolved.access.sessionId,
    viewerId: resolved.session.userId,
    role: resolved.access.role,
  });
  return NextResponse.json({ enabled: true, spaces });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as {
    count?: unknown;
    capacity?: unknown;
    shareAccess?: unknown;
  } | null;
  const resolved = await resolveRequestOrDatabaseUnavailable(
    request,
    courseId,
    typeof body?.shareAccess === "string" ? body.shareAccess : null,
  );
  if (resolved instanceof NextResponse) return resolved;
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }
  try {
    const result = await createClassroomBreakouts({
      courseId: resolved.access.courseId,
      sessionId: resolved.access.sessionId,
      actorId: resolved.session.userId,
      actorRole: resolved.access.role,
      count: typeof body?.count === "number" ? body.count : Number.NaN,
      capacity:
        body?.capacity === null
          ? null
          : typeof body?.capacity === "number"
            ? body.capacity
            : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const unavailable = databaseUnavailableResponse(error);
    if (unavailable) return unavailable;
    if (error instanceof ClassroomSpaceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[classroom:spaces] create failed", error);
    return NextResponse.json(
      { error: "创建分组教室失败" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    spaceId?: unknown;
    targetUserId?: unknown;
    role?: unknown;
    name?: unknown;
    microphoneAllowed?: unknown;
    cameraAllowed?: unknown;
    screenShareAllowed?: unknown;
    shareAccess?: unknown;
  } | null;
  const resolved = await resolveRequestOrDatabaseUnavailable(
    request,
    courseId,
    typeof body?.shareAccess === "string" ? body.shareAccess : null,
  );
  if (resolved instanceof NextResponse) return resolved;
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }
  try {
    const action = typeof body?.action === "string" ? body.action : "";
    if (action === "autoAssign") {
      return NextResponse.json(
        await autoAssignClassroomSpaces({
          courseId: resolved.access.courseId,
          sessionId: resolved.access.sessionId,
          actorId: resolved.session.userId,
          actorRole: resolved.access.role,
        }),
      );
    }
    if (action === "assign") {
      return NextResponse.json({
        spaces: await assignClassroomSpaceMember({
          courseId: resolved.access.courseId,
          sessionId: resolved.access.sessionId,
          actorId: resolved.session.userId,
          actorRole: resolved.access.role,
          spaceId: typeof body?.spaceId === "string" ? body.spaceId : "",
          targetUserId:
            typeof body?.targetUserId === "string" ? body.targetUserId : "",
          role: body?.role === "assistant" ? "assistant" : "student",
        }),
      });
    }
    if (
      action !== "open" &&
      action !== "close" &&
      action !== "rename" &&
      action !== "permissions" &&
      action !== "removeMember"
    ) {
      throw new ClassroomSpaceError("不支持的分组教室操作");
    }
    return NextResponse.json(
      await updateClassroomSpace({
        courseId: resolved.access.courseId,
        sessionId: resolved.access.sessionId,
        actorId: resolved.session.userId,
        actorRole: resolved.access.role,
        action,
        spaceId: typeof body?.spaceId === "string" ? body.spaceId : undefined,
        name: typeof body?.name === "string" ? body.name : undefined,
        targetUserId:
          typeof body?.targetUserId === "string" ? body.targetUserId : undefined,
        microphoneAllowed:
          typeof body?.microphoneAllowed === "boolean"
            ? body.microphoneAllowed
            : undefined,
        cameraAllowed:
          typeof body?.cameraAllowed === "boolean"
            ? body.cameraAllowed
            : undefined,
        screenShareAllowed:
          typeof body?.screenShareAllowed === "boolean"
            ? body.screenShareAllowed
            : undefined,
      }),
    );
  } catch (error) {
    const unavailable = databaseUnavailableResponse(error);
    if (unavailable) return unavailable;
    if (error instanceof ClassroomSpaceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[classroom:spaces] update failed", error);
    return NextResponse.json({ error: "更新分组教室失败" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as {
    shareAccess?: unknown;
  } | null;
  const resolved = await resolveRequestOrDatabaseUnavailable(
    request,
    courseId,
    typeof body?.shareAccess === "string" ? body.shareAccess : null,
  );
  if (resolved instanceof NextResponse) return resolved;
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }
  try {
    await deleteClassroomBreakouts({
      courseId: resolved.access.courseId,
      sessionId: resolved.access.sessionId,
      actorRole: resolved.access.role,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const unavailable = databaseUnavailableResponse(error);
    if (unavailable) return unavailable;
    if (error instanceof ClassroomSpaceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[classroom:spaces] delete failed", error);
    return NextResponse.json({ error: "重置分组教室失败" }, { status: 500 });
  }
}
