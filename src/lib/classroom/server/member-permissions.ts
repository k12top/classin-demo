import { readClassroomCommand, saveClassroomCommand } from "./command-receipt";
import "server-only";
import { prisma } from "@/lib/db";
import type { ClassroomRole } from "../types";
import type { ClassroomMicrophonePermissionAction } from "../member-permissions";
import type { ClassroomMemberPermissionUpdate } from "../signaling/types";
import { ClassroomActionError, countReservedStudentSeats } from "./runtime";
import { classroomModePolicy } from "../mode";
import { classroomStudentStageLimit } from "../stage-settings";
import { readRedisClassroomPresence } from "./redis-presence";

/** The moderation response needs no roster, reward totals or engagement reads. */
export async function applyClassroomMemberPermissions(input: {
  courseId: string; sessionId: string; actorId: string; role: ClassroomRole;
  clientId?: string; commandId?: string;
  action: ClassroomMicrophonePermissionAction;
}): Promise<ClassroomMemberPermissionUpdate> {
  const { courseId, sessionId, actorId, role, action } = input;
  if (role === "student") throw new ClassroomActionError("你没有管理发言权限", 403);
  if (action.type === "setMediaAllowed" && (typeof action.targetUserId !== "string" ||
    typeof action.microphoneAllowed !== "boolean" || typeof action.cameraAllowed !== "boolean")) {
    throw new ClassroomActionError("音视频权限无效", 400);
  }
  const leases = await readRedisClassroomPresence(sessionId);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    const runtime = await tx.classroomRuntime.findUnique({ where: { sessionId }, select: { id: true, courseId: true, status: true, assistantPermissions: true, stageStudentLimit: true, stageInviteBypassLimit: true } });
    if (!runtime || runtime.courseId !== courseId) throw new ClassroomActionError("课堂不存在", 404);
    if (runtime.status === "ended") throw new ClassroomActionError("课堂已结束", 409);
    const command = { sessionId, actorId, role, clientId: input.clientId, commandId: input.commandId, action: action };
    const replay = await readClassroomCommand(tx, command);
    if (replay) return replay as ClassroomMemberPermissionUpdate;
    const microphoneAllowed = action.type === "setMediaAllowed" ? action.microphoneAllowed : action.type === "unmuteAllMicrophones";
    let admit = false;
    if (action.type === "setMediaAllowed" && (action.microphoneAllowed || action.cameraAllowed)) {
      const target = await tx.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId, userId: action.targetUserId } }, select: { role: true, onStage: true } });
      if (target?.role === "student" && !target.onStage) {
        const lesson = await tx.courseSession.findUniqueOrThrow({ where: { id: sessionId }, select: { roomType: true, course: { select: { autoStudentOnStage: true } } } });
        const limit = classroomStudentStageLimit(classroomModePolicy(lesson.roomType, lesson.course.autoStudentOnStage), runtime);
        if (!runtime.stageInviteBypassLimit && limit !== null && await countReservedStudentSeats(tx, sessionId, leases) >= limit) throw new ClassroomActionError("学生席位已满，请先调整上台人数或开启邀请超限", 409);
        // Individual media authorization is also admission to the publishing stage.
        // It never opens a previously closed device; the student still chooses to start it.
        admit = true;
      }
    }
    const result = await tx.classroomMemberState.updateMany({
      where: action.type === "setMediaAllowed" ? { sessionId, userId: action.targetUserId } : { sessionId, role: "student" },
      data: { microphoneAllowed, ...(action.type === "setMediaAllowed" && { cameraAllowed: action.cameraAllowed }), ...(admit && { onStage: true, stageState: "accepted", handRaisedAt: null }) },
    });
    if (action.type === "setMediaAllowed" && !result.count) throw new ClassroomActionError("课堂成员不存在", 404);
    const confirmed = await tx.classroomRuntime.update({ where: { id: runtime.id }, data: { revision: { increment: 1 } }, select: { revision: true } });
    const response: ClassroomMemberPermissionUpdate = { ...(input.commandId && { commandId: input.commandId }), courseId: sessionId, topic: "member-permissions", actorId, revision: confirmed.revision,
      scope: action.type === "setMediaAllowed" ? "member" : "students", microphoneAllowed,
      ...(action.type === "setMediaAllowed" && { targetUserId: action.targetUserId, cameraAllowed: action.cameraAllowed }), ...(admit && { onStage: true, stageState: "accepted" as const }) };
    await saveClassroomCommand(tx, command, response);
    return response;
  }, { maxWait: 1_500, timeout: 3_500 });
}
