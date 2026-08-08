/**
 * Course detail, update, delete API
 * GET    /api/courses/:id
 * PUT    /api/courses/:id
 * DELETE /api/courses/:id
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { serializeCourse } from "@/lib/course-serialize";
import {
  CourseStatus,
  getFinishedDelayMinutes,
  isValidCourseStatus,
} from "@/lib/course-status";
import { promoteCourseIfDueById } from "@/lib/course-promote";
import { stopActiveRecordingsForCourse } from "@/lib/classroom/server/recording-orchestrator";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  casdoorUserIdCandidates,
  normalizeCourseTeachers,
  userCanTeachCourse,
  userOwnsCourse,
} from "@/lib/course-teacher";
import {
  getEffectiveSessionRoster,
  rosterContainsUser,
} from "@/lib/course-session-roster";

export const dynamic = "force-dynamic";

const courseDetailInclude = {
  teachers: { orderBy: { createdAt: "asc" } },
  sessions: {
    orderBy: [
      { startTime: "asc" },
      { position: "asc" },
    ],
    include: {
      series: true,
      teachers: { orderBy: { createdAt: "asc" } },
      students: { orderBy: { createdAt: "asc" } },
      groupLinks: { orderBy: { createdAt: "asc" } },
      _count: {
        select: {
          teachers: true,
          students: true,
          attendances: true,
          recordings: {
            where: {
              status: "completed",
              playbackObjectKey: { not: null },
            },
          },
        },
      },
    },
  },
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
} satisfies Prisma.CourseInclude;

function needsStatusReconciliation(course: {
  status: string;
  startTime: Date | null;
  endTime: Date | null;
  sessions: Array<{ status: string; startTime: Date; endTime: Date }>;
}) {
  const now = new Date();
  const finishThreshold = new Date(
    now.getTime() - getFinishedDelayMinutes() * 60_000,
  );
  const activeStatuses = new Set<string>([
    CourseStatus.SCHEDULED,
    CourseStatus.LIVE,
    CourseStatus.AFTER_CLASS,
  ]);
  const lessonNeedsUpdate = course.sessions.some((lesson) =>
    (lesson.status === CourseStatus.SCHEDULED &&
      lesson.startTime <= now &&
      lesson.endTime > finishThreshold) ||
    (activeStatuses.has(lesson.status) && lesson.endTime <= finishThreshold),
  );
  if (lessonNeedsUpdate) return true;
  return Boolean(
    course.startTime &&
      course.endTime &&
      ((course.status === CourseStatus.SCHEDULED &&
        course.startTime <= now &&
        course.endTime > finishThreshold) ||
        (activeStatuses.has(course.status) &&
          course.endTime <= finishThreshold)),
  );
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
    let course = await prisma.course.findUnique({
      where: { id },
      include: courseDetailInclude,
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // The minute-level reconciler remains authoritative. Detail reads only
    // run the fallback when this course is actually crossing a time boundary;
    // normal navigation therefore stays a single database round trip.
    if (needsStatusReconciliation(course)) {
      await promoteCourseIfDueById(id, { reconcileRecordings: false });
      course = await prisma.course.findUnique({
        where: { id },
        include: courseDetailInclude,
      });
      if (!course) {
        return NextResponse.json({ error: "Course not found" }, { status: 404 });
      }
    }

    const isTeacher = userCanTeachCourse(course, [
      session.userId,
      session.name,
    ]);
    const identityCandidates = Array.from(
      new Set(
        [session.userId, session.name || ""]
          .flatMap(casdoorUserIdCandidates)
          .filter(Boolean),
      ),
    );
    const isCourseStudent =
      course.students.some((student) =>
        identityCandidates.some((candidate) =>
          casdoorUserIdsMatch(student.studentId, candidate),
        ),
      ) ||
      course.groupLinks.some((link) =>
        link.group.members.some((member) =>
          identityCandidates.some((candidate) =>
            casdoorUserIdsMatch(member.userId, candidate),
          ),
        ),
      );
    const visibleSessionIds = new Set<string>();
    if (!isTeacher) {
      await Promise.all(
        course.sessions.map(async (lesson) => {
          const roster = await getEffectiveSessionRoster(lesson.id);
          if (roster && rosterContainsUser(roster, identityCandidates)) {
            visibleSessionIds.add(lesson.id);
          }
        }),
      );
      if (!isCourseStudent && visibleSessionIds.size === 0) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    // A learner can belong to the course while being excluded from a specific
    // lesson through its roster override. Keep the detail payload aligned with
    // the classroom authorization rule so lesson titles, times and recordings
    // do not leak across those overrides.
    const visibleSessions = isTeacher
      ? course.sessions
      : course.sessions.filter((lesson) => visibleSessionIds.has(lesson.id));
    type SerializedCourse = Omit<typeof course, "passcode"> & {
      statusLabel: string;
      isCourseOwner: boolean;
      canTeach: boolean;
      requiresPasscode: boolean;
      nextSession: unknown;
      sessionCount: number;
      completedSessionCount: number;
      passcode?: string | null;
    };
    const serialized = serializeCourse({
      ...course,
      sessions: visibleSessions,
      ...(!isTeacher ? { students: [], groupLinks: [] } : {}),
      ...(!isTeacher && !isCourseStudent
        ? { limitedToSessionId: visibleSessions[0]?.id || null }
        : {}),
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

      if (finalStatus !== undefined && finalStatus !== existing.status) {
        console.info(
          "[course-status]",
          JSON.stringify({
            action: "applied",
            source: "manual-course-put",
            courseId: id,
            previousStatus: existing.status,
            nextStatus: finalStatus,
            occurredAt: new Date().toISOString(),
          }),
        );
      }

    const promoted = await promoteCourseIfDueById(id);
    const course =
      (await prisma.course.findUnique({
        where: { id: promoted?.id ?? id },
        include: {
          teachers: { orderBy: { createdAt: "asc" } },
          sessions: { orderBy: [{ startTime: "asc" }, { position: "asc" }] },
        },
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
    await request.json().catch(() => ({}));
    return NextResponse.json(
      {
        error:
          "课程状态和学生要求必须按课次更新，请使用课次状态或课次学生反馈接口",
        code: "SESSION_SCOPED_OPERATION_REQUIRED",
      },
      { status: 409 },
    );
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
    await stopActiveRecordingsForCourse(id);
    await prisma.course.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete course:", error);
    return NextResponse.json({ error: "Failed to delete course" }, { status: 500 });
  }
}
