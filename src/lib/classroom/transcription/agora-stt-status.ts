export type AgoraTranscriptionStatus =
  | "starting"
  | "running"
  | "recovering"
  | "stopping"
  | "failed"
  | "stopped"
  | "unknown";

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeAgoraTranscriptionStatus(
  value: unknown,
): AgoraTranscriptionStatus {
  const record = recordValue(value);
  const nested = recordValue(record?.serverResponse || record?.data);
  const raw = String(
    record?.status ||
      record?.state ||
      nested?.status ||
      nested?.state ||
      "",
  )
    .trim()
    .toUpperCase();
  if (raw.includes("FAIL") || raw.includes("ERROR")) return "failed";
  if (raw.includes("RECOVER")) return "recovering";
  if (raw.includes("STOPPING")) return "stopping";
  if (raw.includes("STOP") || raw.includes("LEAVE") || raw.includes("END")) {
    return "stopped";
  }
  if (
    raw.includes("RUNNING") ||
    raw === "RUN" ||
    raw === "STARTED" ||
    raw === "IN_PROGRESS"
  ) {
    return "running";
  }
  if (
    raw.includes("START") ||
    raw.includes("PENDING") ||
    raw === "PREPARING" ||
    raw === "PREPARED" ||
    raw === "CREATED"
  ) {
    return "starting";
  }
  return "unknown";
}
