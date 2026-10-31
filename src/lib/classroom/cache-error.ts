/** Cache failures must not masquerade as Prisma pool exhaustion. */
export class ClassroomCacheUnavailableError extends Error {
  readonly code = "CLASSROOM_CACHE_UNAVAILABLE";
  constructor(readonly reason: "unavailable" | "rebuild_busy" | "fallback_capacity") {
    super("Classroom cache temporarily unavailable");
    this.name = "ClassroomCacheUnavailableError";
  }
}
