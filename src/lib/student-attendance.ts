export type StudentAttendanceStatus =
  | "present"
  | "late"
  | "partial"
  | "absent"
  | "excused"
  | "upcoming"
  | "live"
  | "cancelled";

export type StudentAttendanceLessonInput = {
  id: string;
  title: string;
  status: string;
  startTime: Date;
  endTime: Date;
};

export type StudentAttendanceRowInput = {
  sessionId: string;
  enteredAt: Date;
  leftAt: Date | null;
  durationSec: number;
};

export type StudentAttendanceLeaveInput = {
  sessionId: string;
  active: boolean;
};

export type StudentAttendanceLesson = {
  sessionId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  status: StudentAttendanceStatus;
  joinCount: number;
  firstEnteredAt: Date | null;
  lastActivityAt: Date | null;
  totalDurationSec: number;
  completionRate: number;
  late: boolean;
  online: boolean;
  completed: boolean;
};

export type StudentAttendanceSummary = {
  eligibleLessonCount: number;
  completedLessonCount: number;
  attendedLessonCount: number;
  absentLessonCount: number;
  excusedLessonCount: number;
  lateLessonCount: number;
  attendanceRate: number;
  punctualRate: number;
  currentStreak: number;
  totalDurationSec: number;
};

const LATE_THRESHOLD_MS = 10 * 60_000;
const PARTIAL_THRESHOLD = 0.6;

function effectiveRowEnd(
  row: StudentAttendanceRowInput,
  lesson: StudentAttendanceLessonInput,
  now: Date,
) {
  if (row.leftAt) return row.leftAt;
  if (lesson.status === "live" || lesson.status === "afterClass") return now;
  if (lesson.endTime <= now) return lesson.endTime;
  return now;
}

function effectiveRowDuration(
  row: StudentAttendanceRowInput,
  lesson: StudentAttendanceLessonInput,
  now: Date,
) {
  const measured = Math.max(
    0,
    Math.floor((effectiveRowEnd(row, lesson, now).getTime() - row.enteredAt.getTime()) / 1000),
  );
  return Math.max(row.durationSec, measured);
}

function lessonIsCompleted(lesson: StudentAttendanceLessonInput, now: Date) {
  if (lesson.status === "finished") return true;
  if (lesson.status === "live" || lesson.status === "afterClass") return false;
  return lesson.endTime <= now;
}

export function summarizeStudentAttendance(
  lessons: StudentAttendanceLessonInput[],
  rows: StudentAttendanceRowInput[],
  leaves: StudentAttendanceLeaveInput[] = [],
  now = new Date(),
): { lessons: StudentAttendanceLesson[]; summary: StudentAttendanceSummary } {
  const rowsByLesson = new Map<string, StudentAttendanceRowInput[]>();
  const excusedSessionIds = new Set(
    leaves.filter((leave) => leave.active).map((leave) => leave.sessionId),
  );
  for (const row of rows) {
    const bucket = rowsByLesson.get(row.sessionId) || [];
    bucket.push(row);
    rowsByLesson.set(row.sessionId, bucket);
  }

  const lessonResults = lessons
    .map((lesson): StudentAttendanceLesson => {
      const lessonRows = (rowsByLesson.get(lesson.id) || []).sort(
        (a, b) => a.enteredAt.getTime() - b.enteredAt.getTime(),
      );
      const completed = lessonIsCompleted(lesson, now);
      const lessonDurationSec = Math.max(
        1,
        Math.floor((lesson.endTime.getTime() - lesson.startTime.getTime()) / 1000),
      );
      const totalDurationSec = lessonRows.reduce(
        (total, row) => total + effectiveRowDuration(row, lesson, now),
        0,
      );
      const completionRate = Math.min(1, totalDurationSec / lessonDurationSec);
      const firstEnteredAt = lessonRows[0]?.enteredAt || null;
      const lastActivityAt = lessonRows.reduce<Date | null>((latest, row) => {
        const end = effectiveRowEnd(row, lesson, now);
        return !latest || end > latest ? end : latest;
      }, null);
      const online = lessonRows.some(
        (row) =>
          row.leftAt === null &&
          (lesson.status === "live" || lesson.status === "afterClass"),
      );
      const late = Boolean(
        firstEnteredAt &&
          firstEnteredAt.getTime() > lesson.startTime.getTime() + LATE_THRESHOLD_MS,
      );

      let status: StudentAttendanceStatus;
      if (lesson.status === "cancelled") status = "cancelled";
      else if (!lessonRows.length && excusedSessionIds.has(lesson.id)) status = "excused";
      else if (!lessonRows.length && (lesson.status === "live" || lesson.status === "afterClass")) {
        status = "live";
      } else if (!lessonRows.length && !completed) status = "upcoming";
      else if (!lessonRows.length) status = "absent";
      else if (late) status = "late";
      else if (completed && completionRate < PARTIAL_THRESHOLD) status = "partial";
      else status = "present";

      return {
        sessionId: lesson.id,
        title: lesson.title,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        status,
        joinCount: lessonRows.length,
        firstEnteredAt,
        lastActivityAt,
        totalDurationSec,
        completionRate,
        late,
        online,
        completed,
      };
    })
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const eligible = lessonResults.filter(
    (lesson) => lesson.status !== "cancelled" && lesson.status !== "excused",
  );
  const completed = eligible.filter((lesson) => lesson.completed);
  const attended = completed.filter((lesson) => lesson.status !== "absent");
  const punctual = attended.filter((lesson) => !lesson.late);
  const recentCompleted = [...completed].sort(
    (a, b) => b.startTime.getTime() - a.startTime.getTime(),
  );
  let currentStreak = 0;
  for (const lesson of recentCompleted) {
    if (lesson.status === "absent") break;
    currentStreak += 1;
  }

  return {
    lessons: lessonResults,
    summary: {
      eligibleLessonCount: eligible.length,
      completedLessonCount: completed.length,
      attendedLessonCount: attended.length,
      absentLessonCount: completed.length - attended.length,
      excusedLessonCount: lessonResults.filter((lesson) => lesson.status === "excused").length,
      lateLessonCount: attended.filter((lesson) => lesson.late).length,
      attendanceRate: completed.length ? attended.length / completed.length : 0,
      punctualRate: attended.length ? punctual.length / attended.length : 0,
      currentStreak,
      totalDurationSec: lessonResults.reduce(
        (total, lesson) => total + lesson.totalDurationSec,
        0,
      ),
    },
  };
}
