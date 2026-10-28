/** Buffered captions are judged by speech time, not HTTP arrival time. This
 * permits offline replay days later without accepting speech after the lesson. */
export function captionWithinLesson(
  occurredAt: string,
  lesson: { createdAt?: Date | null; endedAt?: Date | null },
  now = Date.now(),
) {
  const at = Date.parse(occurredAt);
  return Number.isFinite(at) && at <= now + 30_000 &&
    (!lesson.createdAt || at >= lesson.createdAt.getTime()) &&
    (!lesson.endedAt || at <= lesson.endedAt.getTime() + 30_000);
}
