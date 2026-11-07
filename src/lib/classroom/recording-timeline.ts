import { getFinishedDelayMinutes } from "../course-status";

export type RecordingLessonEnd = {
  status: string;
  endedAt: Date | null;
  endTime: Date;
};

/** The lesson's replay boundary is independent of provider task-exit confirmation. */
export function endedLessonRecordingTime(
  recording: { createdAt: Date; startedAt: Date | null; stoppedAt: Date | null; stopRequestedAt: Date | null },
  lesson: RecordingLessonEnd | null,
  now = new Date(),
): Date | null {
  if (!lesson || !["finished", "afterClass", "cancelled"].includes(lesson.status)) return null;
  const end = lesson.endedAt?.getTime() ??
    (lesson.endTime?.getTime() + getFinishedDelayMinutes() * 60_000);
  if (!Number.isFinite(end)) return null;
  const boundary = Math.min(end, now.getTime(), recording.stopRequestedAt?.getTime() ?? Infinity);
  // A stale end/deferred cleanup must not assign an old boundary to a new cycle.
  const start = recording.startedAt ?? recording.createdAt;
  if (!start || boundary <= start.getTime()) return null;
  return recording.stoppedAt ?? new Date(boundary);
}
