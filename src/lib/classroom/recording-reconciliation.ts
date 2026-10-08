export function recordingNeedsReconciliation(status: string): boolean {
  return ["starting", "recording", "stopping", "processing"].includes(status);
}

export function recordingResourceExpired(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const { code, reason } = payload as { code?: unknown; reason?: unknown };
  return code === 2 && typeof reason === "string" &&
    /resourceid exceeded time limit/i.test(reason);
}

export function shouldRecoverRecordingFromStorage(input: {
  active: boolean;
  postStop: boolean;
  providerExpired: boolean;
  hasPlayback: boolean;
}): boolean {
  return !input.hasPlayback && (input.postStop || input.providerExpired || !input.active);
}
