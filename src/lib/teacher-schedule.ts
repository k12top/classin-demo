export type TeacherScheduleEventKind = "course" | "busy" | "available";

export type TeacherScheduleEvent = {
  id: string;
  kind: TeacherScheduleEventKind;
  title: string;
  startTime: string;
  endTime: string;
  courseId?: string;
  sessionId?: string;
};

export type TeacherScheduleSummary = {
  teacherId: string;
  events: TeacherScheduleEvent[];
};

export function scheduleRangesOverlap(
  startA: Date | string,
  endA: Date | string,
  startB: Date | string,
  endB: Date | string,
): boolean {
  return new Date(startA).getTime() < new Date(endB).getTime() &&
    new Date(endA).getTime() > new Date(startB).getTime();
}

export function teacherScheduleConflict(
  events: TeacherScheduleEvent[],
  candidateStart?: Date | string | null,
  candidateEnd?: Date | string | null,
) {
  if (!candidateStart || !candidateEnd) {
    return { hasConflict: false, outsidePreference: false, conflicts: [] as TeacherScheduleEvent[] };
  }
  const start = new Date(candidateStart);
  const end = new Date(candidateEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { hasConflict: false, outsidePreference: false, conflicts: [] as TeacherScheduleEvent[] };
  }

  const conflicts = events.filter(
    (event) =>
      event.kind !== "available" &&
      scheduleRangesOverlap(start, end, event.startTime, event.endTime),
  );
  const dayAvailability = events.filter(
    (event) =>
      event.kind === "available" &&
      new Date(event.startTime).toDateString() === start.toDateString(),
  );
  const insidePreference = dayAvailability.some(
    (event) =>
      new Date(event.startTime).getTime() <= start.getTime() &&
      new Date(event.endTime).getTime() >= end.getTime(),
  );

  return {
    hasConflict: conflicts.length > 0,
    outsidePreference: dayAvailability.length > 0 && !insidePreference,
    conflicts,
  };
}

export function startOfLocalDay(date = new Date()): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addLocalDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
