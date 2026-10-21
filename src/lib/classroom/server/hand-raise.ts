import { readClassroomCommand, saveClassroomCommand } from "./command-receipt";
import "server-only";
import { prisma } from "@/lib/db";
import { classroomModePolicy } from "../mode";
import type { ClassroomRole } from "../types";
import type { ClassroomHandRaiseUpdate } from "../signaling/types";
import { ClassroomActionError } from "./runtime";
import { CLASSROOM_RECONNECT_WINDOW_MS } from "../presence";
import { readRedisClassroomPresence } from "@/lib/classroom/server/redis-presence";

/** Commit the student's own hand without reading the full classroom/engagement roster. */
export async function setClassroomHandRaised(input: {
  courseId: string; sessionId: string; actorId: string; role: ClassroomRole;
  clientId?: string; commandId?: string; raised: boolean;
}): Promise<ClassroomHandRaiseUpdate> {
  const { courseId, sessionId, actorId, role, clientId, raised } = input;
  if (role !== "student") throw new ClassroomActionError("只有学生可以举手", 403);
  if (!clientId) throw new ClassroomActionError("课堂连接无效，请重新进入", 409);
  const lesson = await prisma.courseSession.findFirst({ where: { id: sessionId, courseId }, select: { roomType: true } });
  if (!lesson) throw new ClassroomActionError("课次不存在", 404);
  if (!classroomModePolicy(lesson.roomType).showHandRaise) throw new ClassroomActionError("当前课堂模式不支持举手", 409);
  const lease = (await readRedisClassroomPresence(sessionId))?.find(item => item.id === `${sessionId}:${actorId}:${clientId}` && item.userId === actorId && item.leftAt === null);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    const runtime = await tx.classroomRuntime.findUnique({ where: { sessionId }, select: { id: true, courseId: true, status: true, revision: true } });
    if (!runtime || runtime.courseId !== courseId) throw new ClassroomActionError("课堂不存在", 404);
    if (runtime.status === "ended") throw new ClassroomActionError("课堂已经结束", 409);
    const member = await tx.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId, userId: actorId } }, select: { id: true, role: true, handRaisedAt: true } });
    const connection = await tx.classroomConnection.findUnique({ where: { id: `${sessionId}:${actorId}:${clientId}` }, select: { userId: true, sessionId: true, leftAt: true, lastSeenAt: true } });
    if (!member || member.role !== "student" || !connection || connection.userId !== actorId || connection.sessionId !== sessionId ||
      connection.leftAt || Math.max(connection.lastSeenAt.getTime(), lease?.lastSeenAt || 0) < Date.now() - CLASSROOM_RECONNECT_WINDOW_MS) {
      throw new ClassroomActionError("请重新进入课堂后举手", 409);
    }
    const command = { sessionId, actorId, role, clientId: input.clientId, commandId: input.commandId, action: { type: raised ? "raiseHand" : "lowerHand" } };
    const replay = await readClassroomCommand(tx, command);
    if (replay) return replay as ClassroomHandRaiseUpdate;
    const handRaisedAt = raised ? member.handRaisedAt || new Date() : null;
    let revision = runtime.revision;
    if (Boolean(handRaisedAt) !== Boolean(member.handRaisedAt)) {
      await tx.classroomMemberState.update({ where: { id: member.id }, data: { handRaisedAt } });
      revision = (await tx.classroomRuntime.update({ where: { id: runtime.id }, data: { revision: { increment: 1 } }, select: { revision: true } })).revision;
    }
    const response: ClassroomHandRaiseUpdate = { ...(input.commandId && { commandId: input.commandId }), courseId: sessionId, topic: "hand-raise", actorId, revision, handRaisedAt: handRaisedAt?.toISOString() || null };
    await saveClassroomCommand(tx, command, response);
    return response;
  }, { maxWait: 1_500, timeout: 3_500 });
}
