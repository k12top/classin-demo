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

function csvEscape(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function effectiveDurationSec(row: AttendanceRow, now = new Date()): number {
  if (row.leftAt) return row.durationSec;
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const course = await prisma.course.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      ownerId: true,
      teacherId: true,
      teachers: { select: { teacherId: true } },
    },
  });

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (!userCanTeachCourse(course, session.userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.courseAttendance.findMany({
    where: { courseId: id },
    orderBy: [{ enteredAt: "asc" }],
  });

  if (request.nextUrl.searchParams.get("format") === "csv") {
    const header = [
      "studentId",
      "studentName",
      "enteredAt",
      "leftAt",
      "durationSec",
      "duration",
    ];
    const now = new Date();
    const lines = [
      header.map(csvEscape).join(","),
      ...rows.map((row) =>
        [
          row.studentId,
          row.studentName,
          row.enteredAt.toISOString(),
          row.leftAt?.toISOString() ?? "",
          effectiveDurationSec(row, now),
          formatDuration(effectiveDurationSec(row, now)),
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

  const now = new Date();
  return NextResponse.json(
    {
      attendance: rows.map((row) => ({
        ...row,
        enteredAt: row.enteredAt.toISOString(),
        leftAt: row.leftAt?.toISOString() ?? null,
        durationSec: effectiveDurationSec(row, now),
        online: row.leftAt === null,
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    }
  );
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
