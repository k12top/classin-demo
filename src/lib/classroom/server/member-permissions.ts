import "server-only";
import { prisma } from "@/lib/db";
import type { ClassroomRole } from "../types";
import type { ClassroomMicrophonePermissionAction } from "../member-permissions";
import type { ClassroomMemberPermissionUpdate } from "../signaling/types";
import { ClassroomActionError } from "./runtime";

/** The moderation response needs no roster, reward totals or engagement reads. */
export async function applyClassroomMemberPermissions(input: {
  courseId: string; sessionId: string; actorId: string; role: ClassroomRole;
  action: ClassroomMicrophonePermissionAction;
}): Promise<ClassroomMemberPermissionUpdate> {
  const { courseId, sessionId, actorId, role, action } = input;
  if (role === "student") throw new ClassroomActionError("你没有管理发言权限", 403);
  if (action.type === "setMediaAllowed" && (typeof action.targetUserId !== "string" ||
    typeof action.microphoneAllowed !== "boolean" || typeof action.cameraAllowed !== "boolean")) {
    throw new ClassroomActionError("音视频权限无效", 400);
  }
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    const runtime = await tx.classroomRuntime.findUnique({ where: { sessionId }, select: { id: true, courseId: true, status: true, assistantPermissions: true } });
    if (!runtime || runtime.courseId !== courseId) throw new ClassroomActionError("课堂不存在", 404);
    if (runtime.status === "ended") throw new ClassroomActionError("课堂已结束", 409);
    if (role === "assistant" && (runtime.assistantPermissions as Record<string, boolean>)[actorId] !== true) {
      throw new ClassroomActionError("主讲老师尚未授予管理权限", 403);
    }
    const microphoneAllowed = action.type === "setMediaAllowed" ? action.microphoneAllowed : action.type === "unmuteAllMicrophones";
    const result = await tx.classroomMemberState.updateMany({
      where: action.type === "setMediaAllowed" ? { sessionId, userId: action.targetUserId } : { sessionId, role: "student" },
      data: { microphoneAllowed, ...(action.type === "setMediaAllowed" && { cameraAllowed: action.cameraAllowed }) },
    });
    if (action.type === "setMediaAllowed" && !result.count) throw new ClassroomActionError("课堂成员不存在", 404);
    const confirmed = await tx.classroomRuntime.update({ where: { id: runtime.id }, data: { revision: { increment: 1 } }, select: { revision: true } });
    return { courseId: sessionId, topic: "member-permissions", actorId, revision: confirmed.revision,
      scope: action.type === "setMediaAllowed" ? "member" : "students", microphoneAllowed,
      ...(action.type === "setMediaAllowed" && { targetUserId: action.targetUserId, cameraAllowed: action.cameraAllowed }) };
  }, { maxWait: 1_500, timeout: 3_500 });
}
