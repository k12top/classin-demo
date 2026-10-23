/** A skipped locked row is not proof that a classroom was deleted. */
export function classroomHeartbeatFailure(result: { status: string; reason: string; refreshed: boolean } | null | undefined) {
  if (result?.reason === "busy") return { status: 503, body: { code: "heartbeat_busy", retryable: true, refreshed: false }, retryAfter: "2" };
  if (!result || result.status === "missing") return { status: 404, body: { error: "课堂不存在" } };
  if (result.status === "ended") return { status: 409, body: { error: "课堂已结束", code: "classroom_ended" } };
  if (!result.refreshed) return { status: 409, body: { code: "classroom_connection_closed", retryable: false, refreshed: false }, retryAfter: "2" };
  return null;
}
