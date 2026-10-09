export type ClassroomConnectionDiagnostic = {
  event: "connection-state" | "credential-retry" | "credential-recovered" | "credential-failed";
  state?: string; previousState?: string; reason?: string;
  occurredAt: string; attempt?: number; status?: number; delayMs?: number;
  online?: boolean; visibility?: string;
};

const EVENTS = new Set(["connection-state", "credential-retry", "credential-recovered", "credential-failed"]);
const STATES = new Set(["idle", "connecting", "connected", "reconnecting", "disconnected"]);

/** Explicit allowlist: never accept tokens, captions, URLs or arbitrary error text. */
export function parseClassroomDiagnostic(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.sessionId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(v.sessionId) ||
    typeof v.clientId !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(v.clientId) ||
    typeof v.event !== "string" || !EVENTS.has(v.event) ||
    typeof v.occurredAt !== "string" || v.occurredAt.length > 35 || !Number.isFinite(Date.parse(v.occurredAt))) return null;
  const fields: Record<string, unknown> = {
    sessionId: v.sessionId, clientId: v.clientId, event: v.event, occurredAt: v.occurredAt,
  };
  for (const key of ["state", "previousState"]) if (typeof v[key] === "string" && STATES.has(v[key] as string)) fields[key] = v[key];
  if (typeof v.reason === "string" && /^[A-Z_]{1,64}$/.test(v.reason)) fields.reason = v.reason;
  for (const key of ["attempt", "status", "delayMs"]) if (typeof v[key] === "number" && Number.isFinite(v[key]) && v[key] >= 0 && v[key] <= 60_000) fields[key] = v[key];
  if (typeof v.online === "boolean") fields.online = v.online;
  if (v.visibility === "visible" || v.visibility === "hidden") fields.visibility = v.visibility;
  return fields;
}

export function reportClassroomDiagnostic(input: ClassroomConnectionDiagnostic & {
  sessionId: string; clientId: string; recorderToken?: string;
}): void {
  void fetch("/api/classroom/connection-diagnostics", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, online: navigator.onLine, visibility: document.visibilityState }),
    keepalive: true, signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined); // Diagnostic transport never drives recovery.
}
