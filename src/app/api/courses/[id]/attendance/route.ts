import { NextRequest, NextResponse } from "next/server";
import { closeOpenAttendanceSessions } from "@/lib/course-attendance";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { userCanTeachCourse } from "@/lib/course-teacher";

export const dynamic = "force-dynamic";

type AttendanceRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentAvatar: string;
  enteredAt: Date;
  leftAt: Date | null;
  durationSec: number;
};

type AttendanceSummary = {
  studentId: string;
  studentName: string;
  studentAvatar: string;
  sessionCount: number;
  firstEnteredAt: Date;
  latestEnteredAt: Date;
  lastActivityAt: Date | null;
  totalDurationSec: number;
  online: boolean;
  closedByCourseEnd: boolean;
};

const TRANSIENT_DATABASE_ERROR_CODES = new Set([
  "P1001",
  "P1002",
  "P1008",
  "P1017",
  "P2024",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "53300",
  "57P01",
  "57P02",
  "57P03",
]);
const DATABASE_RETRY_DELAYS_MS = [250, 750];

function isTransientDatabaseError(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return false;
    const candidate = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    const code = typeof candidate.code === "string" ? candidate.code : "";
    if (
      TRANSIENT_DATABASE_ERROR_CODES.has(code) ||
      (code.length === 5 && code.startsWith("08"))
    ) {
      return true;
    }

    const message =
      typeof candidate.message === "string" ? candidate.message : "";
    if (
      /can't reach database|connection (?:refused|reset|terminated|closed)|timed?\s*out|server closed the connection|too many clients/i.test(
        message
      )
    ) {
      return true;
    }
    current = candidate.cause;
  }

  return false;
}

async function withDatabaseRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= DATABASE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryDelay = DATABASE_RETRY_DELAYS_MS[attempt];
      if (!isTransientDatabaseError(error) || retryDelay === undefined) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  throw lastError;
}

function csvEscape(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function attendanceEndTime(
  row: AttendanceRow,
  courseEndTime: Date | null | undefined,
  now = new Date()
): Date | null {
  if (row.leftAt) return row.leftAt;
  if (courseEndTime && courseEndTime <= now) return courseEndTime;
  return null;
}

function effectiveDurationSec(
  row: AttendanceRow,
  courseEndTime: Date | null | undefined,
  now = new Date()
): number {
  const endTime = attendanceEndTime(row, courseEndTime, now);
  if (endTime) {
    return Math.max(
      row.durationSec,
      Math.floor((endTime.getTime() - row.enteredAt.getTime()) / 1000)
    );
  }
  return Math.max(
    row.durationSec,
    Math.floor((now.getTime() - row.enteredAt.getTime()) / 1000)
  );
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function summarizeAttendanceRows(
  rows: AttendanceRow[],
  courseEndTime: Date | null | undefined,
  now = new Date()
): AttendanceSummary[] {
  const byStudent = new Map<string, AttendanceSummary>();

  for (const row of rows) {
    const rowEndTime = attendanceEndTime(row, courseEndTime, now);
    const closedByCourseEnd = row.leftAt === null && rowEndTime !== null;
    const durationSec = effectiveDurationSec(row, courseEndTime, now);
    const existing = byStudent.get(row.studentId);
    if (!existing) {
      byStudent.set(row.studentId, {
        studentId: row.studentId,
        studentName: row.studentName,
        studentAvatar: row.studentAvatar,
        sessionCount: 1,
        firstEnteredAt: row.enteredAt,
        latestEnteredAt: row.enteredAt,
        lastActivityAt: rowEndTime,
        totalDurationSec: durationSec,
        online: row.leftAt === null && rowEndTime === null,
        closedByCourseEnd,
      });
      continue;
    }

    existing.sessionCount += 1;
    existing.totalDurationSec += durationSec;
    existing.online = existing.online || (row.leftAt === null && rowEndTime === null);
    existing.closedByCourseEnd = existing.closedByCourseEnd || closedByCourseEnd;
    if (!existing.studentName && row.studentName) {
      existing.studentName = row.studentName;
    }
    if (!existing.studentAvatar && row.studentAvatar) {
      existing.studentAvatar = row.studentAvatar;
    }
    if (row.enteredAt < existing.firstEnteredAt) {
      existing.firstEnteredAt = row.enteredAt;
    }
    if (row.enteredAt > existing.latestEnteredAt) {
      existing.latestEnteredAt = row.enteredAt;
    }
    if (
      rowEndTime &&
      (!existing.lastActivityAt || rowEndTime > existing.lastActivityAt)
    ) {
      existing.lastActivityAt = rowEndTime;
    }
  }

  return Array.from(byStudent.values()).sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    const nameA = a.studentName || a.studentId;
    const nameB = b.studentName || b.studentId;
    return nameA.localeCompare(nameB);
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let courseId = "unknown";

  try {
    const { id } = await params;
    courseId = id;
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const course = await withDatabaseRetry(() =>
      prisma.course.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          ownerId: true,
          teacherId: true,
          endTime: true,
          teachers: { select: { teacherId: true } },
        },
      })
    );

    if (!course) {
      return NextResponse.json(
        { error: "Course not found", code: "COURSE_NOT_FOUND" },
        {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }
    if (!userCanTeachCourse(course, session.userId)) {
      return NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const rows = await withDatabaseRetry(() =>
      prisma.courseAttendance.findMany({
        where: { courseId: id },
        orderBy: [{ enteredAt: "asc" }],
      })
    );

    const now = new Date();
    const attendance = summarizeAttendanceRows(rows, course.endTime, now);

    if (request.nextUrl.searchParams.get("format") === "csv") {
      const header = [
        "studentId",
        "studentName",
        "sessionCount",
        "firstEnteredAt",
        "latestEnteredAt",
        "lastActivityAt",
        "totalDurationSec",
        "totalDuration",
        "online",
        "closedByCourseEnd",
      ];
      const lines = [
        header.map(csvEscape).join(","),
        ...attendance.map((row) =>
          [
            row.studentId,
            row.studentName,
            row.sessionCount,
            row.firstEnteredAt.toISOString(),
            row.latestEnteredAt.toISOString(),
            row.lastActivityAt?.toISOString() ?? "",
            row.totalDurationSec,
            formatDuration(row.totalDurationSec),
            row.online ? "true" : "false",
            row.closedByCourseEnd ? "true" : "false",
          ]
            .map(csvEscape)
            .join(",")
        ),
      ];
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="attendance-${id}.csv"`,
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      });
    }

    return NextResponse.json(
      {
        attendance: attendance.map((row) => ({
          ...row,
          firstEnteredAt: row.firstEnteredAt.toISOString(),
          latestEnteredAt: row.latestEnteredAt.toISOString(),
          lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Failed to fetch course attendance", { courseId, error });
    return NextResponse.json(
      {
        error: "Attendance service temporarily unavailable",
        code: "ATTENDANCE_UNAVAILABLE",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "1",
        },
      }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (body?.event !== "leave") {
    return NextResponse.json({ error: "Unsupported attendance event" }, { status: 400 });
  }

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      students: { select: { studentId: true } },
      groupLinks: {
        include: {
          group: { include: { members: { select: { userId: true } } } },
        },
      },
      teachers: { select: { teacherId: true } },
    },
  });

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const isTeacher = userCanTeachCourse(course, session.userId);
  const isDirectStudent = course.students.some((student) =>
    casdoorUserIdsMatch(student.studentId, session.userId)
  );
  const isGroupStudent = course.groupLinks.some((link) =>
    link.group.members.some((member) =>
      casdoorUserIdsMatch(member.userId, session.userId)
    )
  );

  if (!isTeacher && !isDirectStudent && !isGroupStudent) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await closeOpenAttendanceSessions(id, session.userId);
  return NextResponse.json({ success: true, ...result });
}
