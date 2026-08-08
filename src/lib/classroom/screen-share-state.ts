export type ScreenShareRequestState = "idle" | "requested" | "accepted" | "declined";

export const SCREEN_SHARE_REQUEST_TTL_MS = 2 * 60_000;

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
