import type { ClassroomMemberSnapshot, ClassroomRuntimeSnapshot } from "./types";
import type { ClassroomHandRaiseUpdate } from "./signaling/types";

export function raisedClassroomHands(members: readonly ClassroomMemberSnapshot[]) {
  return members.filter(member => member.role === "student" && member.online && member.handRaisedAt)
    .sort((a, b) => Date.parse(a.handRaisedAt!) - Date.parse(b.handRaisedAt!) || a.userId.localeCompare(b.userId));
}

/** Students can announce their own hand, never advance the classroom's control revision. */
export function applyClassroomHandRaiseUpdate(
  runtime: ClassroomRuntimeSnapshot,
  update: ClassroomHandRaiseUpdate,
  publisherId?: string,
  trustedResponse = false,
  seenRevision = -1,
): ClassroomRuntimeSnapshot | null {
  if (runtime.status === "ended" || !Number.isSafeInteger(update.revision) || update.revision < 0 ||
    (trustedResponse ? update.revision < runtime.revision : update.revision <= Math.max(runtime.revision, seenRevision)) ||
    (update.handRaisedAt !== null && (typeof update.handRaisedAt !== "string" || !Number.isFinite(Date.parse(update.handRaisedAt))))) return null;
  const actor = runtime.members.find(member => member.userId === update.actorId);
  if (!actor || actor.role !== "student" ||
    (!trustedResponse && (!publisherId || !actor.signalingUserIds?.includes(publisherId)))) return null;
  return {
    ...runtime,
    revision: trustedResponse ? update.revision : runtime.revision,
    members: runtime.members.map(member => member === actor ? { ...member, handRaisedAt: update.handRaisedAt } : member),
  };
}
