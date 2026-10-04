export type ClassroomIntegrationEventType = "classroom.started" | "classroom.ended" | "classroom.user_left";

export type ClassroomIntegrationEvent = {
  source: "classroom";
  version: 1;
  eventId: string;
  type: ClassroomIntegrationEventType;
  occurredAt: string;
  courseId: string;
  sessionId: string;
  courseStatus: string;
  classroomStatus: string;
  ended: boolean;
  reason: string;
  startedAt: string | null;
  actor?: { userId: string; role: string };
};

export function normalizeParentOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    return url.origin;
  } catch { return undefined; }
}

/** A document emits each confirmed state once, and one departure. */
export function createClassroomEventEmitter(send: (event: ClassroomIntegrationEvent) => void) {
  const sent = new Set<string>();
  let left = false;
  let latest: ClassroomIntegrationEvent | undefined;
  return {
    observe(input: Omit<ClassroomIntegrationEvent, "source" | "version" | "eventId" | "type" | "ended">) {
      if (left || !["live", "ended"].includes(input.classroomStatus)) return;
      const type = input.classroomStatus === "ended" ? "classroom.ended" : "classroom.started";
      const key = `${input.sessionId}:${input.startedAt}:${type}`;
      if (sent.has(key)) return;
      sent.add(key);
      latest = { ...input, source: "classroom", version: 1, eventId: crypto.randomUUID(), type, ended: type === "classroom.ended" };
      send(latest);
    },
    leave(input: Omit<ClassroomIntegrationEvent, "source" | "version" | "eventId" | "type" | "ended">) {
      if (left) return;
      left = true;
      latest = { ...input, source: "classroom", version: 1, eventId: crypto.randomUUID(), type: "classroom.user_left", ended: input.classroomStatus === "ended" };
      send(latest);
    },
    replay() { if (latest) send(latest); },
  };
}
