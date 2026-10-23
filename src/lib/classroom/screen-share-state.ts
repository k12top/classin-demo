import type { ClassroomRole, ClassroomScreenShareLease, ClassroomParticipant } from "@/lib/classroom/types";

export type ScreenShareRequestState = "idle" | "requested" | "accepted" | "declined";

export const SCREEN_SHARE_REQUEST_TTL_MS = 2 * 60_000;

/** Permission survives capture stop; only the current publisher's video is sharing. */
export function memberScreenShareStatus(
  member: { userId: string; screenShareState: string },
  lease: ClassroomScreenShareLease | undefined,
  participants: readonly ClassroomParticipant[],
): "idle" | "requested" | "ready" | "starting" | "sharing" | "declined" {
  if (lease?.userId === member.userId) {
    return participants.some(p => p.kind === "screen" && p.id === String(lease.rtcUid) && p.hasVideo)
      ? "sharing" : "starting";
  }
  if (member.screenShareState === "accepted") return "ready";
  if (member.screenShareState === "requested") return "requested";
  return member.screenShareState === "declined" ? "declined" : "idle";
}

export function canShareClassroomScreen(input: {
  role: ClassroomRole;
  member?: { onStage: boolean; stageState: string; screenShareState: string } | null;
  studentSharingSupported: boolean;
  assistantManagementAllowed?: boolean;
}): boolean {
  if (input.role === "teacher") return true;
  if (input.role === "assistant") return input.assistantManagementAllowed !== false;
  return Boolean(input.studentSharingSupported && input.member?.onStage &&
    input.member.stageState === "accepted" && input.member.screenShareState === "accepted");
}

export function ownsScreenShare(lease: ClassroomScreenShareLease | undefined, userId: string, clientId: string) {
  return lease?.userId === userId && lease.clientId === clientId;
}

export function screenShareStateAfter(
  current: ScreenShareRequestState,
  event: "request" | "accept" | "decline" | "stop",
): ScreenShareRequestState {
  if (event === "request") return "requested";
  if (event === "accept") return current === "requested" ? "accepted" : current;
  if (event === "decline") return current === "requested" ? "declined" : "idle";
  return "idle";
}

export function screenShareRequestIsActive(
  state: string,
  requestedAt: Date | null,
  now = new Date(),
) {
  return (
    state === "requested" &&
    Boolean(requestedAt) &&
    now.getTime() - requestedAt!.getTime() <= SCREEN_SHARE_REQUEST_TTL_MS
  );
}

export function shouldStopUnauthorizedScreenShare({
  role,
  state,
  sharing,
  allowedWithoutApproval,
}: {
  role: ClassroomRole;
  state: ScreenShareRequestState;
  sharing: boolean;
  allowedWithoutApproval: boolean;
}): boolean {
  return (
    role === "student" &&
    !allowedWithoutApproval &&
    state !== "accepted" &&
    sharing
  );
}
