import { getFinishedDelayMinutes } from "./course-status";

export function joinLessonHasEnded(lesson: {
  status: string; endedAt: Date | null; endTime: Date;
}, runtimeStatus?: string | null, now = new Date()) {
  if (lesson.status === "cancelled") return false;
  return Boolean(lesson.endedAt || runtimeStatus === "ended" ||
    ["finished", "afterClass"].includes(lesson.status) ||
    (["scheduled", "live"].includes(lesson.status) &&
      lesson.endTime.getTime() <= now.getTime() - getFinishedDelayMinutes() * 60_000));
}

export function buildLessonPlaybackPath(courseId: string, sessionId: string, options: {
  embed?: boolean; lang?: string; parentOrigin?: string;
} = {}) {
  const qs = new URLSearchParams({ sessionId });
  if (options.embed) qs.set("embed", "1");
  if (options.lang) qs.set("lang", options.lang);
  if (options.parentOrigin) qs.set("parentOrigin", options.parentOrigin);
  return `/courses/${encodeURIComponent(courseId)}/playback?${qs}`;
}
