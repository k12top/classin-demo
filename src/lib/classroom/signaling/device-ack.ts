import type { ClassroomRuntimeSnapshot } from "../types";
import type { ClassroomMemberPermissionUpdate, ClassroomDeviceAck } from "./types";
export type DeviceReport = { commandId: string; at: number; updatedAt: number; received: number; failed: number; unknown: number };
const DEVICE_REPORT_VISIBLE_MS = 1_500;
const states = new Set(["on", "off", "pending", "interrupted", "failed", "unknown"]);
export function deviceReportDismissDelay(report: DeviceReport, now = Date.now()) {
  return Math.max(0, report.updatedAt + DEVICE_REPORT_VISIBLE_MS - now);
}
/** Advisory reports only. They never grant permissions or replace RTC presence. */
export function createDeviceAckTracker() {
  let pending: { command: ClassroomMemberPermissionUpdate; at: number; replies: Map<string, ClassroomDeviceAck> } | null = null;
  const report = (updatedAt: number): DeviceReport | null => pending ? { commandId: pending.command.commandId!, at: pending.at, updatedAt, received: pending.replies.size,
    failed: [...pending.replies.values()].filter(reply => [reply.microphone, reply.camera].some(state => state === "failed" || state === "interrupted") || (!pending!.command.microphoneAllowed && reply.microphone === "on") || (pending!.command.cameraAllowed === false && reply.camera === "on")).length,
    unknown: [...pending.replies.values()].filter(reply => [reply.microphone, reply.camera].some(state => state === "pending" || state === "unknown")).length } : null;
  return {
    begin(command: ClassroomMemberPermissionUpdate, now = Date.now()) { pending = command.commandId ? { command, at: now, replies: new Map() } : null; return report(now); },
    accept(runtime: ClassroomRuntimeSnapshot, ack: ClassroomDeviceAck, publisherId?: string, now = Date.now()) {
      if (runtime.status === "ended" || ack.topic !== "device-ack" || !pending || now - pending.at > 30_000 || ack.courseId !== pending.command.courseId || ack.commandId !== pending.command.commandId || ack.revision !== pending.command.revision || !publisherId || !states.has(ack.microphone) || !states.has(ack.camera)) return null;
      const actor = runtime.members.find(member => member.userId === ack.actorId);
      if (!actor?.signalingUserIds?.includes(publisherId) || (pending.command.scope === "students" ? actor.role !== "student" : actor.userId !== pending.command.targetUserId) || pending.replies.has(publisherId)) return null;
      if (actor.microphoneAllowed !== pending.command.microphoneAllowed || (pending.command.cameraAllowed !== undefined && actor.cameraAllowed !== pending.command.cameraAllowed)) return null;
      pending.replies.set(publisherId, ack);
      return report(now);
    },
    clear() { pending = null; },
  };
}
