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
} from "@/lib/course-status";
import { closeOpenAttendanceSessionsForCourse } from "@/lib/course-attendance";
import { promoteCourseIfDueById } from "@/lib/course-promote";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  normalizeCourseTeachers,
  userCanTeachCourse,
  userOwnsCourse,
} from "@/lib/course-teacher";

export const dynamic = "force-dynamic";

function courseAttendanceCloseTime(
  endTime: Date | null | undefined,
  now = new Date()
): Date {
  return endTime && endTime <= now ? endTime : now;
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
  try {
    await promoteCourseIfDueById(id);
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        teachers: { orderBy: { createdAt: "asc" } },
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

    const isTeacher = userCanTeachCourse(course, [
      session.userId,
      session.name,
    ]);
    type SerializedCourse = Omit<typeof course, "passcode"> & {
      statusLabel: string;
      isCourseOwner: boolean;
      canTeach: boolean;
      requiresPasscode: boolean;
      passcode?: string | null;
    };
    const serialized = serializeCourse({
      ...course,
      isCourseOwner: userOwnsCourse(course, session.userId),
      canTeach: isTeacher,
      requiresPasscode: course.roomType === 10 && Boolean(course.passcode),
    }) as SerializedCourse;
    if (!isTeacher) {
      delete serialized.passcode;
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

  // Course owner or teaching teachers can update course details.
  const existing = await prisma.course.findUnique({
    where: { id },
    include: { teachers: { orderBy: { createdAt: "asc" } } },
  });
  if (
    !existing ||
    !userCanTeachCourse(existing, [session.userId, session.name])
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

    try {
      const body = await request.json();
      const {
        name,
        description,
        roomType,
        status,
        startTime,
        endTime,
        studentRemarks,
        passcode,
        primaryTeacher,
        primaryTeacherId,
        primaryTeacherName,
        teachers,
        teacherIds,
      } = body;

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

      const teacherFieldsRequested =
        primaryTeacher !== undefined ||
        primaryTeacherId !== undefined ||
        primaryTeacherName !== undefined ||
        teachers !== undefined ||
        teacherIds !== undefined;

      let nextLeadTeacher:
        | { teacherId: string; teacherName: string; teacherAvatar: string }
        | undefined;
      let nextTeachers:
        | { teacherId: string; teacherName: string; teacherAvatar: string }[]
        | undefined;

      if (teacherFieldsRequested) {
        if (!userOwnsCourse(existing, session.userId)) {
          return NextResponse.json(
            { error: "Only the course owner can change course teachers" },
            { status: 403 }
          );
        }

        const primaryTeacherInput = primaryTeacher ?? {
          teacherId: primaryTeacherId ?? existing.teacherId,
          teacherName: primaryTeacherName ?? existing.teacherName,
          teacherAvatar: existing.teacherAvatar,
        };
        const teacherInputs =
          teachers !== undefined
            ? Array.isArray(teachers)
              ? teachers
              : []
            : teacherIds !== undefined && Array.isArray(teacherIds)
              ? teacherIds.map((teacherId: string) => ({ teacherId }))
              : existing.teachers;

        nextTeachers = normalizeCourseTeachers(primaryTeacherInput, teacherInputs);
        if (nextTeachers.length === 0) {
          return NextResponse.json(
            { error: "At least one course teacher is required" },
            { status: 400 }
          );
        }
        nextLeadTeacher = nextTeachers[0];
      }

      const nextStartTime =
        startTime !== undefined
          ? startTime
            ? new Date(startTime)
            : null
          : existing.startTime;
      const nextEndTime =
        endTime !== undefined
          ? endTime
            ? new Date(endTime)
            : null
          : existing.endTime;
      if (
        (nextStartTime && Number.isNaN(nextStartTime.getTime())) ||
        (nextEndTime && Number.isNaN(nextEndTime.getTime()))
      ) {
        return NextResponse.json({ error: "课程时间格式无效" }, { status: 400 });
      }
      if (nextStartTime && nextEndTime && nextEndTime <= nextStartTime) {
        return NextResponse.json({ error: "结束时间必须晚于开始时间" }, { status: 400 });
      }

      const updateData = {
          ...(name !== undefined && { name: name.trim() }),
          ...(description !== undefined && { description: description.trim() }),
          ...(roomType !== undefined && { roomType }),
          ...(finalPasscode !== undefined && { passcode: finalPasscode }),
          ...(finalStatus !== undefined && { status: finalStatus }),
          ...(startTime !== undefined && { startTime: nextStartTime }),
          ...(endTime !== undefined && { endTime: nextEndTime }),
          ...(studentRemarks !== undefined && { studentRemarks: studentRemarks.trim() }),
          ...(nextLeadTeacher && {
            teacherId: nextLeadTeacher.teacherId,
            teacherName: nextLeadTeacher.teacherName,
            teacherAvatar: nextLeadTeacher.teacherAvatar,
          }),
        };

      if (nextTeachers) {
        await prisma.$transaction([
          prisma.course.update({
            where: { id },
            data: updateData,
          }),
          prisma.courseTeacher.deleteMany({ where: { courseId: id } }),
          prisma.courseTeacher.createMany({
            data: nextTeachers.map((teacher) => ({
              courseId: id,
              teacherId: teacher.teacherId,
              teacherName: teacher.teacherName,
              teacherAvatar: teacher.teacherAvatar,
            })),
            skipDuplicates: true,
          }),
        ]);
      } else {
        await prisma.course.update({
          where: { id },
          data: updateData,
        });
      }

    const promoted = await promoteCourseIfDueById(id);
    const course =
      (await prisma.course.findUnique({
        where: { id: promoted?.id ?? id },
        include: { teachers: { orderBy: { createdAt: "asc" } } },
      })) ?? promoted;
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
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
    include: {
      students: true,
      groupLinks: true,
      teachers: { select: { teacherId: true } },
    }
  });

  if (!existing) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const isTeacher = userCanTeachCourse(existing, [
    session.userId,
    session.name,
  ]);
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
    const { status, studentRemarks } = body;

    const dataToUpdate: Record<string, unknown> = {};

    if (status !== undefined) {
      if (typeof status !== "string" || !isValidCourseStatus(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      if (isTeacher) {
        dataToUpdate.status = status;
        if (status === CourseStatus.AFTER_CLASS && !existing.endedAt) {
          dataToUpdate.endedAt = new Date();
        }
        if (status === CourseStatus.SCHEDULED || status === CourseStatus.LIVE) {
          dataToUpdate.endedAt = null;
        }
      } else if (status === CourseStatus.CANCELLED) {
        dataToUpdate.status = status;
      } else {
        return NextResponse.json(
          { error: "Only teachers can correct course status" },
          { status: 403 }
        );
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

    if (dataToUpdate.status === CourseStatus.FINISHED) {
      await closeOpenAttendanceSessionsForCourse(
        id,
        courseAttendanceCloseTime(course.endTime)
      );
    }

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

  const existing = await prisma.course.findUnique({
    where: { id },
    select: { ownerId: true, teacherId: true },
  });
  if (!existing || !userOwnsCourse(existing, session.userId)) {
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
