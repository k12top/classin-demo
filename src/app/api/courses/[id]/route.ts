/**
 * Course detail, update, delete API
 * GET    /api/courses/:id
 * PUT    /api/courses/:id
 * DELETE /api/courses/:id
 */
import { NextRequest, NextResponse } from "next/server";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { serializeCourse } from "@/lib/course-serialize";
import {
  CourseStatus,
  isValidCourseStatus,
  resolveManualFinishedStatus,
} from "@/lib/course-status";
import { promoteCourseIfDueById } from "@/lib/course-promote";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await promoteCourseIfDueById(id);
    let course = await prisma.course.findUnique({
      where: { id },
      include: {
        students: true,
        groupLinks: {
          include: {
            group: {
              include: {
                members: true,
              },
            },
          },
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const isTeacher = casdoorUserIdsMatch(course.teacherId, session.userId);
    const serialized = serializeCourse({
      ...course,
      requiresPasscode: course.roomType === 10 && Boolean(course.passcode),
    });
    if (!isTeacher) {
      delete (serialized as any).passcode;
    }

    return NextResponse.json(
      { course: serialized },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Failed to fetch course:", error);
    return NextResponse.json({ error: "Failed to fetch course" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Only the course teacher can update
  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing || !casdoorUserIdsMatch(existing.teacherId, session.userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

    try {
      const body = await request.json();
      const { name, description, roomType, status, startTime, endTime, studentRemarks, passcode } = body;

      if (status !== undefined && !isValidCourseStatus(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      let finalStatus = status;
      // Revert LIVE -> SCHEDULED if the teacher reschedules to a future time
      if (
        finalStatus === undefined &&
        existing.status === CourseStatus.LIVE &&
        startTime
      ) {
        if (new Date(startTime) > new Date()) {
          finalStatus = CourseStatus.SCHEDULED;
        }
      }

      let finalPasscode: string | null | undefined = undefined;
      const targetRoomType = roomType !== undefined ? roomType : existing.roomType;
      if (targetRoomType === 10) {
        if (passcode !== undefined) {
          if (passcode === null || passcode.trim() === "") {
            finalPasscode = Math.floor(100000 + Math.random() * 900000).toString();
          } else {
            const trimmed = passcode.trim();
            if (!/^\d{6}$/.test(trimmed)) {
              return NextResponse.json({ error: "入会密码必须是6位数字" }, { status: 400 });
            }
            finalPasscode = trimmed;
          }
        }
      } else {
        if (roomType !== undefined && existing.roomType === 10) {
          finalPasscode = null;
        }
      }

      let course = await prisma.course.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(description !== undefined && { description: description.trim() }),
          ...(roomType !== undefined && { roomType }),
          ...(finalPasscode !== undefined && { passcode: finalPasscode }),
          ...(finalStatus !== undefined && { status: finalStatus }),
          ...(startTime !== undefined && { startTime: startTime ? new Date(startTime) : null }),
          ...(endTime !== undefined && { endTime: endTime ? new Date(endTime) : null }),
          ...(studentRemarks !== undefined && { studentRemarks: studentRemarks.trim() }),
        },
      });

    const promoted = await promoteCourseIfDueById(id);
    if (promoted) {
      course = promoted;
    }

    return NextResponse.json({ course: serializeCourse(course) });
  } catch (error) {
    console.error("Failed to update course:", error);
    return NextResponse.json({ error: "Failed to update course" }, { status: 500 });
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

  // Find course and check permissions
  const existing = await prisma.course.findUnique({
    where: { id },
    include: { students: true, groupLinks: true }
  });

  if (!existing) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const isTeacher = casdoorUserIdsMatch(existing.teacherId, session.userId);
  const isDirectStudent = existing.students.some(s => casdoorUserIdsMatch(s.studentId, session.userId));
  
  // Also check if user is a member of any group linked to this course
  let isGroupStudent = false;
  if (!isTeacher && !isDirectStudent) {
    const linkedGroupIds = existing.groupLinks.map(l => l.groupId);
    if (linkedGroupIds.length > 0) {
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId: session.userId,
          groupId: { in: linkedGroupIds },
        },
      });
      isGroupStudent = !!membership;
    }
  }

  if (!isTeacher && !isDirectStudent && !isGroupStudent) {
     return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { status, studentRemarks, force } = body;

    const dataToUpdate: Record<string, unknown> = {};

    if (status !== undefined) {
      if (status === CourseStatus.CANCELLED) {
        dataToUpdate.status = status;
      } else if (isTeacher && status === CourseStatus.FINISHED) {
        const resolved = resolveManualFinishedStatus(
          existing.status,
          existing.endTime,
          force === true
        );
        if (!resolved) {
          return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
        }
        dataToUpdate.status = resolved;
        if (resolved === CourseStatus.AFTER_CLASS && !existing.endedAt) {
          dataToUpdate.endedAt = new Date();
        }
      } else if (
        isTeacher &&
        (status === CourseStatus.SCHEDULED || status === CourseStatus.LIVE)
      ) {
        return NextResponse.json(
          { error: "scheduled/live status is synced from classroom state" },
          { status: 400 }
        );
      } else if (!isValidCourseStatus(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
    }
    
    // Students can update remarks. Teachers could theoretically update it too but usually they read it.
    if (studentRemarks !== undefined) {
      dataToUpdate.studentRemarks = studentRemarks.trim();
    }

    const course = await prisma.course.update({
      where: { id },
      data: dataToUpdate,
    });

    const promoted = await promoteCourseIfDueById(id);

    return NextResponse.json({ course: serializeCourse(promoted ?? course) });
  } catch (error) {
    console.error("Failed to patch course:", error);
    return NextResponse.json({ error: "Failed to patch course" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing || !casdoorUserIdsMatch(existing.teacherId, session.userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.course.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete course:", error);
    return NextResponse.json({ error: "Failed to delete course" }, { status: 500 });
  }
}
