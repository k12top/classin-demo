import { normalizeClassroomComposition, touchComposition } from "../composition";
import { withScreenShareInvitation } from "../screen-share-selection";
import { readClassroomCommand, saveClassroomCommand } from "./command-receipt";
import "server-only";
import { prisma } from "@/lib/db";
import { classroomModePolicy } from "../mode";
import type { ClassroomRole } from "../types";
import type { ClassroomScreenShareRequest } from "../signaling/types";
import { ClassroomActionError } from "./runtime";

/** Invitation commits need no reward totals, connection roster or engagement reads. */
export async function requestClassroomScreenShare(input: {
  courseId: string;
  sessionId: string;
  actorId: string;
  role: ClassroomRole;
  clientId?: string; commandId?: string;
  targetUserId: string;
  autoDisplay?: boolean;
}): Promise<ClassroomScreenShareRequest> {
  const { courseId, sessionId, actorId, role, targetUserId } = input;
  if (role !== "teacher" && role !== "assistant") throw new ClassroomActionError("当前角色不能执行此课堂操作", 403);
  if (typeof targetUserId !== "string" || !targetUserId) throw new ClassroomActionError("共享请求的学生无效", 400);
  if (input.autoDisplay !== undefined && typeof input.autoDisplay !== "boolean") throw new ClassroomActionError("共享展示方式无效", 400);
  const lesson = await prisma.courseSession.findFirst({
    where: { id: sessionId, courseId },
    select: { roomType: true, course: { select: { autoStudentOnStage: true } } },
  });
  if (!lesson) throw new ClassroomActionError("课次不存在", 404);
  if (!classroomModePolicy(lesson.roomType, lesson.course.autoStudentOnStage).studentCanShareWhenOnStage) {
    throw new ClassroomActionError("当前课堂模式不支持学生屏幕共享", 409);
  }
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    const runtime = await tx.classroomRuntime.findUnique({
      where: { sessionId }, select: { id: true, courseId: true, status: true, assistantPermissions: true, composition: true },
    });
    if (!runtime || runtime.courseId !== courseId) throw new ClassroomActionError("课堂不存在", 404);
    if (runtime.status === "ended") throw new ClassroomActionError("课堂已经结束", 409);
    const command = { sessionId, actorId, role, clientId: input.clientId, commandId: input.commandId, action: { type: "requestScreenShare", targetUserId, ...(input.autoDisplay !== undefined && { autoDisplay: input.autoDisplay }) } };
    const replay = await readClassroomCommand(tx, command);
    if (replay) return replay as ClassroomScreenShareRequest;
    const targetWhere = { sessionId_userId: { sessionId, userId: targetUserId } };
    const target = await tx.classroomMemberState.findUnique({ where: targetWhere, select: { role: true } });
    if (!target || target.role !== "student") throw new ClassroomActionError("只能向当前课堂的学生发起共享请求", 409);
    const requestedAt = new Date();
    await tx.classroomMemberState.update({
      where: targetWhere, data: { screenShareState: "requested", screenShareRequestedAt: requestedAt },
    });
    const composition = touchComposition(
      withScreenShareInvitation(normalizeClassroomComposition(runtime.composition), targetUserId, requestedAt, input.autoDisplay),
      actorId, requestedAt,
    );
    const confirmed = await tx.classroomRuntime.update({
      where: { id: runtime.id },
      data: { revision: { increment: 1 }, composition: JSON.parse(JSON.stringify(composition)) },
      select: { revision: true },
    });
    const response: ClassroomScreenShareRequest = { ...(input.commandId && { commandId: input.commandId }), courseId: sessionId, topic: "screen-share-request", actorId, revision: confirmed.revision,
      targetUserId, requestedAt: requestedAt.toISOString() };
    await saveClassroomCommand(tx, command, response);
    return response;
  }, { maxWait: 1_500, timeout: 3_500 });
}
