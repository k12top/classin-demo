/** Only terminal lesson responses stop a live page; transient failures do not. */
export function isEndedClassroomResponse(status: number, body: unknown): boolean {
  if ((status !== 403 && status !== 409) || !body || typeof body !== "object") return false;
  const { code, error } = body as { code?: unknown; error?: unknown };
  return code === "course_finished" || code === "course_cancelled" ||
    code === "classroom_ended" ||
    error === "课次已结束" || error === "课次已取消" || error === "课堂已结束";
}

/** Heartbeat freshness affects presence, never the teacher's stage grant. */
export function classroomMemberPresence(input: {
  onStage: boolean;
  presence: string;
  lastSeenAt: Date;
}, now: number, onlineWindowMs: number, connected?: boolean) {
  return {
    online: connected ?? (input.presence === "online" && now - input.lastSeenAt.getTime() <= onlineWindowMs),
    onStage: input.onStage,
  };
}
