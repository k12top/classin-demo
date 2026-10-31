import type { ClassroomRuntimeSnapshot } from "./types";
import type { ClassroomScreenShareRequest } from "./signaling/types";
import { SCREEN_SHARE_REQUEST_TTL_MS } from "./screen-share-state";

/** Even an invitation older than the global caption revision can be a valid
 * hint to read authoritative state. It must not itself overwrite newer grants.
 */
export function verifiedScreenShareInvitation(runtime: ClassroomRuntimeSnapshot, request: ClassroomScreenShareRequest, publisherId?: string, now = Date.now()) {
  const actor = runtime.members.find(member => member.userId === request.actorId);
  const requestedAt = Date.parse(request.requestedAt);
  return runtime.status !== "ended" && Number.isSafeInteger(request.revision) && request.revision > 0 &&
    Number.isFinite(requestedAt) && now - requestedAt <= SCREEN_SHARE_REQUEST_TTL_MS &&
    Boolean(publisherId && actor?.signalingUserIds?.includes(publisherId) && (actor.role === "teacher" || actor.role === "assistant")) &&
    runtime.members.some(member => member.userId === request.targetUserId && member.role === "student");
}

/** Apply a committed invitation without waiting for the full classroom state. */
export function applyClassroomScreenShareRequest(
  runtime: ClassroomRuntimeSnapshot,
  request: ClassroomScreenShareRequest,
  publisherId?: string,
  trustedResponse = false,
  now = Date.now(),
): ClassroomRuntimeSnapshot | null {
  const requestedAt = Date.parse(request.requestedAt);
  if (runtime.status === "ended" || !Number.isSafeInteger(request.revision) || request.revision <= runtime.revision ||
    !Number.isFinite(requestedAt) || now - requestedAt > SCREEN_SHARE_REQUEST_TTL_MS) return null;
  const actor = runtime.members.find(member => member.userId === request.actorId);
  if (!trustedResponse && (!publisherId || !actor?.signalingUserIds?.includes(publisherId) ||
    !(actor.role === "teacher" || actor.role === "assistant"))) return null;
  if (!runtime.members.some(member => member.userId === request.targetUserId && member.role === "student")) return null;
  return {
    ...runtime,
    revision: request.revision,
    members: runtime.members.map(member => member.userId === request.targetUserId
      ? { ...member, screenShareState: "requested", screenShareRequestedAt: request.requestedAt }
      : member),
  };
}
