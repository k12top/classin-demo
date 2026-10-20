import type { ClassroomAction } from "./types";

type ReleaseAction = Extract<ClassroomAction, { type: "releaseScreenShare" }>;

/** Keep failed releases until acknowledged; serialize responses and deduplicate stops. */
export class ScreenShareReleaseQueue {
  private pending = new Map<string, ReleaseAction>();
  private flight: Promise<void> | null = null;

  add(action: ReleaseAction) {
    this.pending.set(`${action.spaceId || "main"}:${action.claimId}`, action);
  }

  flush(send: (action: ReleaseAction) => Promise<void>): Promise<void> {
    if (this.flight) return this.flight;
    this.flight = this.drain(send).finally(() => { this.flight = null; });
    return this.flight;
  }

  private async drain(send: (action: ReleaseAction) => Promise<void>) {
    for (const [key, action] of this.pending) {
      await send(action);
      this.pending.delete(key);
    }
  }
}
