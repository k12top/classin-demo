/**
 * Sync course status from Agora ClassState (internal — classroom page only)
 * PATCH /api/courses/:id/class-state
 * Body: { classState: 0|1|2|3 }
 */
import { NextRequest, NextResponse } from "next/server";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { serializeCourse } from "@/lib/course-serialize";
import {
  canApplyStatusFromAgora,
  mapAgoraClassStateToCourseStatus,
} from "@/lib/course-status";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  if (!casdoorUserIdsMatch(existing.teacherId, session.userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const classState = body?.classState;

    if (
      typeof classState !== "number" ||
      !Number.isInteger(classState) ||
      classState < 0 ||
      classState > 3
    ) {
      return NextResponse.json(
        { error: "classState must be an integer 0–3" },
        { status: 400 }
      );
    }

    const nextStatus = mapAgoraClassStateToCourseStatus(classState);
    if (!nextStatus || nextStatus === existing.status) {
      return NextResponse.json({ course: serializeCourse(existing) });
    }

    if (!canApplyStatusFromAgora(existing.status, nextStatus)) {
      return NextResponse.json({ course: serializeCourse(existing) });
    }

    const course = await prisma.course.update({
      where: { id },
      data: { status: nextStatus },
    });

    return NextResponse.json({ course: serializeCourse(course) });
  } catch (error) {
    console.error("Failed to sync class state:", error);
    return NextResponse.json(
      { error: "Failed to sync class state" },
      { status: 500 }
    );
  }
}
