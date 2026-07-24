/**
 * Rotate a course to a fresh Agora room while keeping the course and share
 * links stable.
 */
import { NextRequest, NextResponse } from "next/server";
import { CourseStatus } from "@/lib/course-status";
import { serializeCourse } from "@/lib/course-serialize";
import { userCanTeachCourse } from "@/lib/course-teacher";
import { generateCourseRoomUuid } from "@/lib/course-room";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.course.findUnique({
    where: { id },
    include: { teachers: { select: { teacherId: true } } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (!userCanTeachCourse(existing, [session.userId, session.name])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.status === CourseStatus.CANCELLED) {
    return NextResponse.json(
      { error: "已取消的课程不能重新开启课堂" },
      { status: 409 },
    );
  }

  const now = new Date();
  if (existing.endTime && existing.endTime <= now) {
    return NextResponse.json(
      { error: "课程结束时间已到，请先把结束时间修改到未来" },
      { status: 409 },
    );
  }

  try {
    const roomUuid = generateCourseRoomUuid();
    const course = await prisma.course.update({
      where: { id },
      data: {
        roomUuid,
        status: CourseStatus.LIVE,
        endedAt: null,
        recordUrl: null,
      },
      include: { teachers: { orderBy: { createdAt: "asc" } } },
    });

    console.info(
      "[course-status]",
      JSON.stringify({
        action: "applied",
        source: "manual-room-reopen",
        courseId: id,
        previousStatus: existing.status,
        nextStatus: CourseStatus.LIVE,
        previousRoomUuid: existing.roomUuid,
        nextRoomUuid: roomUuid,
        occurredAt: now.toISOString(),
      }),
    );

    return NextResponse.json({
      success: true,
      roomUuid,
      course: serializeCourse(course),
    });
  } catch (error) {
    console.error("Failed to reopen Agora room:", error);
    return NextResponse.json(
      { error: "Failed to reopen classroom" },
      { status: 500 },
    );
  }
}
