import { canManageClassroom } from "@/lib/classroom/server/management";
import { NextRequest, NextResponse } from "next/server";
import type { ClassroomMessageSnapshot } from "@/lib/classroom/types";
import {
  ensureClassroomRuntime,
  touchClassroomMember,
} from "@/lib/classroom/server/runtime";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { prisma } from "@/lib/db";
import { databaseUnavailableResponse } from "@/lib/database-response";
import { classroomMessageRecordId, isClassroomClientMessageId } from "@/lib/classroom/server/message-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "sin1";

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
  return resolved;
}

async function getMessages(
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
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }
  const messages = await prisma.classroomMessage.findMany({
    where: {
      sessionId: resolved.access.sessionId,
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

async function postMessage(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as {
    clientMessageId?: unknown;
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
  if (body?.clientMessageId !== undefined && !isClassroomClientMessageId(body.clientMessageId)) {
    return NextResponse.json({ error: "消息标识无效" }, { status: 400 });
  }
  const resolved = await access(
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
  const sessionId = resolved.access.sessionId;
  const scope =
    body?.scope === "room" ||
    body?.scope === "staff" ||
    body?.scope === "direct"
      ? body.scope
      : "classroom";
  const spaceId = typeof body?.spaceId === "string" ? body.spaceId : null;
  const recipientId =
    typeof body?.recipientId === "string" ? body.recipientId : null;
  const messageId = isClassroomClientMessageId(body?.clientMessageId)
    ? classroomMessageRecordId(sessionId, resolved.session.userId, body.clientMessageId) : undefined;
  const replay = async () => {
    if (!messageId) return null;
    const existing = await prisma.classroomMessage.findUnique({ where: { id: messageId } });
    if (!existing) return null;
    if (existing.sessionId !== sessionId || existing.senderId !== resolved.session.userId ||
      existing.content !== content || existing.scope !== scope ||
      existing.spaceId !== (scope === "room" ? spaceId : null) ||
      existing.recipientId !== (scope === "direct" ? recipientId : null)) {
      return NextResponse.json({ error: "请使用新的标识发送不同消息", code: "message_id_conflict" }, { status: 409 });
    }
    const state = await prisma.classroomRuntime.findUnique({ where: { id: existing.runtimeId }, select: { revision: true } });
    return NextResponse.json({ message: publicMessage(existing), revision: state?.revision ?? 0 });
  };
  const received = await replay();
  if (received) return received;

  // Chat does not modify the classroom runtime. One small read avoids the
  // heartbeat/caption runtime writes and parallel connection-pool requests.
  const readAccess = async () => (await prisma.$queryRaw<{
    id: string; revision: number; status: string; chatEnabled: boolean; chatMuted: boolean | null;
  }[]>`SELECT r."id", r."revision", r."status", r."chatEnabled", m."chatMuted"
       FROM "ClassroomRuntime" r LEFT JOIN "ClassroomMemberState" m
         ON m."sessionId" = r."sessionId" AND m."userId" = ${resolved.session.userId}
       WHERE r."sessionId" = ${sessionId}`)[0];
  let runtime = await readAccess();
  if (!runtime) { await ensureClassroomRuntime(resolved.access.courseId, sessionId); runtime = await readAccess(); }
  if (!runtime || runtime.status === "ended") {
    return NextResponse.json({ error: "课堂已结束", code: "classroom_ended" }, { status: 409 });
  }
  let chatMuted = runtime.chatMuted;
  if (chatMuted === null) {
    chatMuted = (await touchClassroomMember(resolved.access.courseId, resolved.session, resolved.access.role, undefined, sessionId)).chatMuted;
  }
  const teachingRole = resolved.access.role === "teacher" || resolved.access.role === "assistant";
  if (!teachingRole && (!runtime.chatEnabled || chatMuted)) {
    return NextResponse.json({ error: runtime.chatEnabled ? "你已被禁言" : "课堂聊天已关闭" }, { status: 403 });
  }
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
        sessionId,
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
      where: { sessionId, userId: recipientId },
      select: { userId: true },
    });
    if (!recipient) {
      return NextResponse.json({ error: "私聊对象不在课堂中" }, { status: 404 });
    }
  }

  let message;
  try {
    message = await prisma.classroomMessage.create({
      data: {
        ...(messageId && { id: messageId }),
        runtimeId: runtime.id,
        courseId: resolved.access.courseId,
        sessionId,
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
    });
  } catch (error) {
    if (messageId && error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const duplicate = await replay();
      if (duplicate) return duplicate;
    }
    throw error;
  }
  return NextResponse.json(
    { message: publicMessage(message), revision: runtime.revision },
    { status: 201 },
  );
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { return await getMessages(request, context); }
  catch (error) { const response = databaseUnavailableResponse(error); if (response) return response; throw error; }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { return await postMessage(request, context); }
  catch (error) {
    const response = databaseUnavailableResponse(error);
    if (response) return response;
    console.error("[classroom:messages] send failed", error);
    return NextResponse.json({ error: "消息暂时发送失败，请重试", code: "message_send_failed" }, { status: 500 });
  }
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
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }
  if (
    !await canManageClassroom(resolved.access.sessionId, resolved.session.userId, resolved.access.role)
  ) {
    return NextResponse.json(
      { error: "只有教师可以撤回课堂消息" },
      { status: 403 },
    );
  }
  const sessionId = resolved.access.sessionId;
  const runtime = await ensureClassroomRuntime(
    resolved.access.courseId,
    sessionId,
  );
  const result = await prisma.classroomMessage.updateMany({
    where: { id: messageId, sessionId, deletedAt: null },
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
