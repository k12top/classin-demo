/**
 * Sync course status from Agora ClassState (internal — classroom page only)
 * PATCH /api/courses/:id/class-state
 * Body: { classState: 0|1|2|3 }
 * Agora close/destroy (3) is not treated as course end; schedule controls finish.
 */
import { NextRequest, NextResponse } from "next/server";
import { serializeCourse } from "@/lib/course-serialize";
import { promoteCourseIfDueById } from "@/lib/course-promote";
import {
  canApplyStatusFromAgora,
  CourseStatus,
  mapAgoraClassStateToCourseStatus,
} from "@/lib/course-status";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import { userCanTeachCourse } from "@/lib/course-teacher";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  if (!userCanTeachCourse(existing, session.userId)) {
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
    if (!nextStatus) {
      const promoted = await promoteCourseIfDueById(id);
      return NextResponse.json({
        course: serializeCourse(promoted ?? existing),
      });
    }

    if (nextStatus === CourseStatus.AFTER_CLASS) {
      if (
        existing.status === CourseStatus.FINISHED ||
        existing.status === CourseStatus.CANCELLED
      ) {
        const promoted = await promoteCourseIfDueById(id);
        return NextResponse.json({
          course: serializeCourse(promoted ?? existing),
        });
      }

      if (
        existing.status === CourseStatus.AFTER_CLASS &&
        existing.endedAt
      ) {
        const promoted = await promoteCourseIfDueById(id);
        return NextResponse.json({
          course: serializeCourse(promoted ?? existing),
        });
      }

      if (canApplyStatusFromAgora(existing.status, nextStatus)) {
        await prisma.course.update({
          where: { id },
          data: {
            status: CourseStatus.AFTER_CLASS,
            endedAt: existing.endedAt ?? new Date(),
          },
        });
      }

      const promoted = await promoteCourseIfDueById(id);
      return NextResponse.json({
        course: serializeCourse(promoted ?? existing),
      });
    }

    if (
      nextStatus === existing.status ||
      !canApplyStatusFromAgora(existing.status, nextStatus)
    ) {
      const promoted = await promoteCourseIfDueById(id);
      return NextResponse.json({
        course: serializeCourse(promoted ?? existing),
      });
    }

    await prisma.course.update({
      where: { id },
      data: { status: nextStatus },
    });

    const promoted = await promoteCourseIfDueById(id);
    return NextResponse.json({
      course: serializeCourse(promoted ?? (await prisma.course.findUnique({ where: { id } }))!),
    });
  } catch (error) {
    console.error("Failed to sync class state:", error);
    return NextResponse.json(
      { error: "Failed to sync class state" },
      { status: 500 }
    );
  }
}
