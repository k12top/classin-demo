import "server-only";
import { prisma } from "@/lib/db";
import { classroomGraceEndAt } from "../policy";
import { readClassroomCommand, saveClassroomCommand } from "./command-receipt";
import { enqueueClassroomEvent } from "./integration-events";
import { ClassroomActionError } from "./runtime";
import type { ClassroomRole } from "../types";

export async function changeClassroomTiming(input: { sessionId: string; courseId: string; actorId: string; role: ClassroomRole; commandId?: string; action: "reopen" | "extend"; minutes?: number }, now = new Date()) {
  if (input.role !== "teacher" && input.role !== "assistant") throw new ClassroomActionError("Forbidden", 403);
  if (input.action === "extend" && ![15, 30, 60].includes(input.minutes || 0)) throw new ClassroomActionError("延课须为 15、30 或 60 分钟", 400);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId"=${input.sessionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "CourseSession" WHERE "id"=${input.sessionId} FOR UPDATE`;
    const lesson = await tx.courseSession.findUniqueOrThrow({ where: { id: input.sessionId } });
    if (lesson.courseId !== input.courseId) throw new ClassroomActionError("Forbidden", 403);
    const action = { type: input.action, ...(input.action === "extend" && { minutes: input.minutes }) };
    const command = { ...input, action };
    const replay = await readClassroomCommand(tx, command);
    if (replay) return replay as { startTime: string; endTime: string; revision: number };
    const runtime = await tx.classroomRuntime.findUnique({ where: { sessionId: input.sessionId } });
    if (lesson.status === "cancelled") throw new ClassroomActionError("已取消课次不能执行此操作", 409);
    if (input.action === "reopen" && lesson.status !== "finished" && !lesson.endedAt && runtime?.status !== "ended") throw new ClassroomActionError("课堂尚未结束", 409);
    if (input.action === "extend" && (lesson.endedAt || runtime?.status === "ended" || !["scheduled", "live"].includes(lesson.status))) throw new ClassroomActionError("请先重新开课，再延长课程", 409);
    const startTime = input.action === "reopen" ? now : lesson.startTime;
    const endTime = input.action === "reopen" ? new Date(now.getTime() + Math.max(15 * 60_000, lesson.endTime.getTime() - lesson.startTime.getTime()))
      : new Date(Math.max(now.getTime(), lesson.endTime.getTime()) + input.minutes! * 60_000);
    await tx.courseSession.update({ where: { id: lesson.id }, data: { startTime, endTime, ...(input.action === "reopen" && { status: "live", endedAt: null }) } });
    const state = await tx.classroomRuntime.upsert({ where: { sessionId: lesson.id },
      create: { sessionId: lesson.id, courseId: lesson.courseId, status: input.action === "reopen" ? "live" : "waiting", startedAt: input.action === "reopen" ? now : null, graceEndsAt: classroomGraceEndAt(endTime) },
      update: { graceEndsAt: classroomGraceEndAt(endTime), revision: { increment: 1 }, ...(input.action === "reopen" && { status: "live", startedAt: now, transcriptionError: null }) } });
    if (input.action === "reopen") {
      // Old heartbeats and stage grants cannot silently resume in the new class cycle.
      await tx.classroomConnection.updateMany({ where: { sessionId: lesson.id, leftAt: null }, data: { leftAt: now } });
      await tx.classroomMemberState.updateMany({ where: { sessionId: lesson.id, role: "student" }, data: { onStage: false, stageState: "left", microphoneAllowed: false, cameraAllowed: false, whiteboardWritable: false, handRaisedAt: null, screenShareState: "idle", presence: "offline" } });
      await tx.classroomProviderEvent.deleteMany({ where: { noticeId: `classroom-empty:${lesson.id}` } });
      await enqueueClassroomEvent(tx, lesson.id, "classroom.started", "reopened", { userId: input.actorId, role: input.role });
    }
    const result = { startTime: startTime.toISOString(), endTime: endTime.toISOString(), revision: state.revision };
    await saveClassroomCommand(tx, command, result);
    return result;
  }, { maxWait: 1500, timeout: 8000 });
}
