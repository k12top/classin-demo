import { NextRequest, NextResponse } from "next/server";
import type { ClassroomMessageSnapshot } from "@/lib/classroom/types";
import {
  ensureClassroomRuntime,
  getClassroomRuntimeSnapshot,
  touchClassroomMember,
} from "@/lib/classroom/server/runtime";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function publicMessage(message: {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  scope: string;
  spaceId: string | null;
  recipientId: string | null;
  kind: string;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
}): ClassroomMessageSnapshot {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    senderRole:
      message.senderRole === "teacher" || message.senderRole === "assistant"
        ? message.senderRole
        : "student",
    scope:
      message.scope === "room" ||
      message.scope === "staff" ||
      message.scope === "direct"
        ? message.scope
        : "classroom",
    spaceId: message.spaceId,
    recipientId: message.recipientId,
    kind: message.kind === "system" ? "system" : "text",
    content: message.deletedAt ? "" : message.content,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

async function access(
  request: NextRequest,
  courseId: string,
  shareAccess: string | null,
) {
  const resolved = await resolveClassroomRequestAccess(
    request,
    courseId,
    shareAccess,
  );
  if (!resolved.ok) return resolved;
  await touchClassroomMember(
    courseId,
    resolved.session,
    resolved.access.role,
  );
  return resolved;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const resolved = await access(
    request,
    courseId,
    request.nextUrl.searchParams.get("shareAccess"),
  );
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }
  const messages = await prisma.classroomMessage.findMany({
    where: {
      courseId,
      OR: [
        { scope: "classroom" },
        ...(resolved.access.role !== "student" ? [{ scope: "staff" }] : []),
        {
          scope: "direct",
          OR: [
            { senderId: resolved.session.userId },
            { recipientId: resolved.session.userId },
          ],
        },
        {
          scope: "room",
          ...(resolved.access.role === "teacher"
            ? {}
            : {
                space: {
                  members: {
                    some: {
                      userId: resolved.session.userId,
                      active: true,
                    },
                  },
                },
              }),
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({
    messages: messages.reverse().map(publicMessage),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as {
    content?: unknown;
    scope?: unknown;
    spaceId?: unknown;
    recipientId?: unknown;
    shareAccess?: unknown;
  } | null;
  const content =
    typeof body?.content === "string" ? body.content.trim() : "";
  if (!content || content.length > 1000) {
    return NextResponse.json(
      { error: "消息长度应为 1–1000 个字符" },
      { status: 400 },
    );
  }
  const resolved = await access(
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
  const runtime = await ensureClassroomRuntime(courseId);
  const member = await prisma.classroomMemberState.findUniqueOrThrow({
    where: {
      courseId_userId: {
        courseId,
        userId: resolved.session.userId,
      },
    },
  });
  const teachingRole =
    resolved.access.role === "teacher" ||
    resolved.access.role === "assistant";
  if (!teachingRole && (!runtime.chatEnabled || member.chatMuted)) {
    return NextResponse.json(
      { error: runtime.chatEnabled ? "你已被禁言" : "课堂聊天已关闭" },
      { status: 403 },
    );
  }
  const scope =
    body?.scope === "room" ||
    body?.scope === "staff" ||
    body?.scope === "direct"
      ? body.scope
      : "classroom";
  const spaceId = typeof body?.spaceId === "string" ? body.spaceId : null;
  const recipientId =
    typeof body?.recipientId === "string" ? body.recipientId : null;
  if (scope === "staff" && !teachingRole) {
    return NextResponse.json({ error: "只有教师可以使用助教频道" }, { status: 403 });
  }
  if (scope === "direct" && !recipientId) {
    return NextResponse.json({ error: "请选择私聊对象" }, { status: 400 });
  }
  if (scope === "room") {
    if (!spaceId) {
      return NextResponse.json({ error: "请选择分组教室" }, { status: 400 });
    }
    const spaceAccess = await prisma.classroomSpace.findFirst({
      where: {
        id: spaceId,
        courseId,
        ...(resolved.access.role === "teacher"
          ? {}
          : {
              members: {
                some: { userId: resolved.session.userId, active: true },
              },
            }),
      },
      select: { id: true },
    });
    if (!spaceAccess) {
      return NextResponse.json({ error: "你无权访问该分组教室" }, { status: 403 });
    }
  }
  if (scope === "direct" && recipientId) {
    const recipient = await prisma.classroomMemberState.findFirst({
      where: { courseId, userId: recipientId },
      select: { userId: true },
    });
    if (!recipient) {
      return NextResponse.json({ error: "私聊对象不在课堂中" }, { status: 404 });
    }
  }

  const [message] = await prisma.$transaction([
    prisma.classroomMessage.create({
      data: {
        runtimeId: runtime.id,
        courseId,
        senderId: resolved.session.userId,
        senderName:
          resolved.session.displayName ||
          resolved.session.name ||
          resolved.session.userId,
        senderRole: resolved.access.role,
        scope,
        spaceId: scope === "room" ? spaceId : null,
        recipientId: scope === "direct" ? recipientId : null,
        content,
      },
    }),
    prisma.classroomRuntime.update({
      where: { id: runtime.id },
      data: { revision: { increment: 1 } },
    }),
  ]);
  const runtimeSnapshot = await getClassroomRuntimeSnapshot(courseId);
  return NextResponse.json(
    { message: publicMessage(message), revision: runtimeSnapshot.revision },
    { status: 201 },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as {
    messageId?: unknown;
    shareAccess?: unknown;
  } | null;
  const messageId =
    typeof body?.messageId === "string" ? body.messageId : "";
  if (!messageId) {
    return NextResponse.json({ error: "缺少消息 ID" }, { status: 400 });
  }
  const resolved = await access(
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
  if (
    resolved.access.role !== "teacher" &&
    resolved.access.role !== "assistant"
  ) {
    return NextResponse.json(
      { error: "只有教师可以撤回课堂消息" },
      { status: 403 },
    );
  }
  const runtime = await ensureClassroomRuntime(courseId);
  const result = await prisma.classroomMessage.updateMany({
    where: { id: messageId, courseId, deletedAt: null },
    data: {
      deletedAt: new Date(),
      deletedBy: resolved.session.userId,
    },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "消息不存在或已撤回" }, { status: 404 });
  }
  const updated = await prisma.classroomRuntime.update({
    where: { id: runtime.id },
    data: { revision: { increment: 1 } },
  });
  return NextResponse.json({ ok: true, revision: updated.revision });
}
