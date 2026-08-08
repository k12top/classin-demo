/**
 * Course list & create API
 * GET  /api/courses — list courses (teacher: own; student: enrolled)
 * POST /api/courses — create a new course (teacher only)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma, withDatabaseReadRetry } from "@/lib/db";
import { databaseUnavailableResponse } from "@/lib/database-response";
import { buildCourseShareUrl, buildJoinUrl, joinLinkStatus } from "@/lib/join-link";
import { serializeCourse, serializeCourses } from "@/lib/course-serialize";
import { promoteCoursesIfDue } from "@/lib/course-promote";
import {
  casdoorUserIdCandidates,
  normalizeCourseTeachers,
  userCanTeachCourse,
  userOwnsCourse,
} from "@/lib/course-teacher";
import { generateCourseRoomUuid } from "@/lib/course-room";
import {
  applyCourseListSort,
  courseListOrderBy,
  courseListStatusWhere,
  parseCourseListSort,
  parseCourseStatusFilter,
} from "@/lib/course-list-query";

export const dynamic = "force-dynamic";

function sessionStudentIdCandidates(session: { userId: string; name?: string }): string[] {
  const values = [session.userId, session.name || ""].flatMap((value) => {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const stripped = trimmed.includes("/") ? trimmed.split("/").pop() || trimmed : trimmed;
    return [trimmed, stripped];
  });
  return Array.from(new Set(values.filter(Boolean)));
}

async function getCoursesOnce(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sortParsed = parseCourseListSort(request.nextUrl.searchParams);
  if ("error" in sortParsed) {
    return NextResponse.json({ error: sortParsed.error }, { status: 400 });
  }
  const statusParsed = parseCourseStatusFilter(
    request.nextUrl.searchParams.get("status")
  );
  if (statusParsed !== null && typeof statusParsed === "object") {
    return NextResponse.json({ error: statusParsed.error }, { status: 400 });
  }
  const orderBy = courseListOrderBy(sortParsed);
  const statusWhere = courseListStatusWhere(statusParsed);

  try {
    if (session.role === "teacher") {
      // A platform teacher can also join another teacher's course as a student.
      // Keep both teaching courses and student-enrolled courses visible here.
      const userIdCandidates = Array.from(
        new Set(
          [session.userId, session.name || ""].flatMap((candidate) =>
            casdoorUserIdCandidates(candidate)
          )
        )
      );
      const studentIdCandidates = sessionStudentIdCandidates(session);
      const groupMemberships = await prisma.groupMember.findMany({
        where: { userId: { in: studentIdCandidates } },
        select: { groupId: true },
      });
      const groupIds = groupMemberships.map((membership) => membership.groupId);
      const coursesRaw = await prisma.course.findMany({
        where: {
          OR: [
            { ownerId: { in: userIdCandidates } },
            { teacherId: { in: userIdCandidates } },
            { teachers: { some: { teacherId: { in: userIdCandidates } } } },
            {
              sessions: {
                some: {
                  OR: [
                    { leadTeacherId: { in: userIdCandidates } },
                    {
                      teachers: {
                        some: {
                          teacherId: { in: userIdCandidates },
                          action: "include",
                        },
                      },
                    },
                  ],
                },
              },
            },
            {
              students: {
                some: { studentId: { in: studentIdCandidates } },
              },
            },
            {
              sessions: {
                some: {
                  students: {
                    some: {
                      studentId: { in: studentIdCandidates },
                      action: "include",
                    },
                  },
                },
              },
            },
            ...(groupIds.length > 0
              ? [{ groupLinks: { some: { groupId: { in: groupIds } } } }]
              : []),
          ],
          ...statusWhere,
        },
        include: {
          teachers: { orderBy: { createdAt: "asc" } },
          sessions: {
            orderBy: { startTime: "asc" },
            include: {
              _count: {
                select: {
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
          students: { select: { studentId: true, studentName: true, studentAvatar: true } },
          groupLinks: {
            include: {
              group: {
                select: {
                  id: true,
                  name: true,
                  members: {
                    select: {
                      userId: true,
                      userName: true,
                      userAvatar: true,
                    },
                  },
                },
              },
            },
          },
          joinLinks: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              token: true,
              purpose: true,
              passcode: true,
              label: true,
              expiresAt: true,
              revokedAt: true,
              useCount: true,
            },
          },
        },
        orderBy,
      });
      const origin = request.nextUrl.origin.replace(/\/$/, "");
      const courses = applyCourseListSort(
        serializeCourses(coursesRaw.map(({ joinLinks, ...course }) => {
          const canTeach = userCanTeachCourse(course, userIdCandidates);
          return {
            ...course,
            passcode: canTeach ? course.passcode : undefined,
            students: canTeach ? course.students : [],
            groupLinks: canTeach ? course.groupLinks : [],
            isCourseOwner:
              canTeach &&
              userIdCandidates.some((candidate) =>
                userOwnsCourse(course, candidate)
              ),
            canTeach,
            joinedAs: canTeach ? "teacher" : "student",
            activeJoinLinks: canTeach
              ? joinLinks
                  .filter(
                    (link) =>
                      joinLinkStatus(link) === "active" &&
                      link.purpose !== "course"
                  )
                  .map((link) => ({
                    id: link.id,
                    label: link.label,
                    requiresPasscode: Boolean(link.passcode),
                    passcode: link.passcode,
                    joinUrl: buildJoinUrl(origin, link.token),
                    useCount: link.useCount,
                  }))
              : [],
            activeCourseShareLinks: canTeach
              ? joinLinks
                  .filter(
                    (link) =>
                      joinLinkStatus(link) === "active" &&
                      link.purpose === "course"
                  )
                  .map((link) => ({
                    id: link.id,
                    label: link.label,
                    requiresPasscode: Boolean(link.passcode),
                    passcode: link.passcode,
                    courseShareUrl: buildCourseShareUrl(origin, link.token),
                    useCount: link.useCount,
                  }))
              : [],
          };
        })),
        sortParsed
      );
      return NextResponse.json(
        { courses },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0, must-revalidate",
          },
        }
      );
    } else {
      // Student sees courses they're assigned to plus public classes.
      const studentIdCandidates = sessionStudentIdCandidates(session);
      const groupMemberships = await prisma.groupMember.findMany({
        where: { userId: { in: studentIdCandidates } },
        select: { groupId: true },
      });
      const groupIds = groupMemberships.map((m: { groupId: string }) => m.groupId);
      const directCourses = await prisma.course.findMany({
        where: {
          OR: [
            { students: { some: { studentId: { in: studentIdCandidates } } } },
            {
              sessions: {
                some: {
                  students: {
                    some: {
                      studentId: { in: studentIdCandidates },
                      action: "include",
                    },
                  },
                },
              },
            },
            ...(groupIds.length > 0
              ? [
                  {
                    sessions: {
                      some: {
                        groupLinks: {
                          some: { groupId: { in: groupIds }, action: "include" },
                        },
                      },
                    },
                  },
                ]
              : []),
          ],
          ...statusWhere,
        },
        include: {
          teachers: { orderBy: { createdAt: "asc" } },
          sessions: {
            orderBy: { startTime: "asc" },
            include: {
              _count: {
                select: {
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
          students: { select: { studentId: true, studentName: true, studentAvatar: true } },
        },
        orderBy,
      });
      // Also find courses via course-level group membership.
      let groupCourses: typeof directCourses = [];
      if (groupIds.length > 0) {
        groupCourses = await prisma.course.findMany({
          where: {
            groupLinks: { some: { groupId: { in: groupIds } } },
            NOT: { students: { some: { studentId: { in: studentIdCandidates } } } },
            ...statusWhere,
          },
          include: {
            teachers: { orderBy: { createdAt: "asc" } },
            sessions: {
              orderBy: { startTime: "asc" },
              include: {
                _count: {
                  select: {
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
            students: { select: { studentId: true, studentName: true, studentAvatar: true } },
          },
          orderBy,
        });
      }

      const publicCourses = await prisma.course.findMany({
        where: {
          roomType: 10,
          NOT: {
            OR: [
              { students: { some: { studentId: { in: studentIdCandidates } } } },
              ...(groupIds.length > 0
                ? [{ groupLinks: { some: { groupId: { in: groupIds } } } }]
                : []),
            ],
          },
          ...statusWhere,
        },
        include: {
          teachers: { orderBy: { createdAt: "asc" } },
          sessions: {
            orderBy: { startTime: "asc" },
            include: {
              _count: {
                select: {
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
          students: { select: { studentId: true, studentName: true, studentAvatar: true } },
        },
        orderBy,
      });

      const courses = applyCourseListSort(
        serializeCourses([
          ...directCourses.map((course) => ({
            ...course,
            requiresPasscode: course.roomType === 10 && Boolean(course.passcode),
            publicListing: false,
            passcode: undefined,
          })),
          ...groupCourses.map((course) => ({
            ...course,
            requiresPasscode: course.roomType === 10 && Boolean(course.passcode),
            publicListing: false,
            passcode: undefined,
          })),
          ...publicCourses.map((course) => ({
            ...course,
            requiresPasscode: Boolean(course.passcode),
            publicListing: true,
            passcode: undefined,
          })),
        ]),
        sortParsed
      );
      return NextResponse.json(
        { courses },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0, must-revalidate",
          },
        }
      );
    }
  } catch (error) {
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    // Status promotion is an idempotent write, so keep it outside the read-only
    // retry boundary. Provider reconciliation remains owned by the minute cron.
    await promoteCoursesIfDue(undefined, { reconcileRecordings: false }).catch(
      (error) => {
        console.warn("Course status promotion was deferred:", error);
      },
    );
    return await withDatabaseReadRetry(() => getCoursesOnce(request));
  } catch (error) {
    console.error("Failed to fetch courses:", error);
    return (
      databaseUnavailableResponse(error) ||
      NextResponse.json({ error: "Failed to fetch courses" }, { status: 500 })
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can create courses" }, { status: 403 });
  }

  const creationRequestId = request.headers
    .get("idempotency-key")
    ?.trim()
    .slice(0, 160) || null;

  try {
    const body = await request.json();
    const {
      name,
      description,
      roomType,
      startTime,
      endTime,
      studentRemarks,
      passcode,
      requirePasscode,
      primaryTeacher,
      primaryTeacherId,
      primaryTeacherName,
      teachers,
      teacherIds,
      courseKind,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    }

    const normalizedCourseKind =
      courseKind === "standalone" ||
      (courseKind === undefined && Boolean(startTime))
        ? "standalone"
        : "series";
    if (courseKind !== undefined && !["series", "standalone"].includes(courseKind)) {
      return NextResponse.json(
        { error: "courseKind must be series or standalone" },
        { status: 400 },
      );
    }
    if (
      normalizedCourseKind === "standalone" &&
      (!startTime || !endTime)
    ) {
      return NextResponse.json(
        { error: "单独课程必须填写开始时间和结束时间" },
        { status: 400 },
      );
    }
    if (Boolean(startTime) !== Boolean(endTime)) {
      return NextResponse.json(
        { error: "创建首个课次时必须同时填写开始和结束时间" },
        { status: 400 },
      );
    }
    const parsedStartTime = startTime ? new Date(startTime) : null;
    const parsedEndTime = endTime ? new Date(endTime) : null;
    if (
      (parsedStartTime && Number.isNaN(parsedStartTime.getTime())) ||
      (parsedEndTime && Number.isNaN(parsedEndTime.getTime()))
    ) {
      return NextResponse.json({ error: "课次时间格式无效" }, { status: 400 });
    }
    if (parsedStartTime && parsedStartTime < new Date(Date.now() - 120000)) {
      return NextResponse.json({ error: "开始时间不能早于当前时间" }, { status: 400 });
    }
    if (parsedStartTime && parsedEndTime && parsedEndTime <= parsedStartTime) {
      return NextResponse.json({ error: "结束时间必须晚于开始时间" }, { status: 400 });
    }

    let finalPasscode: string | null = null;
    if (roomType === 10) {
      const shouldRequirePasscode =
        requirePasscode === true || (requirePasscode === undefined && Boolean(passcode?.trim()));
      if (shouldRequirePasscode) {
        const passcodeStr = passcode?.trim() || Math.floor(100000 + Math.random() * 900000).toString();
        if (!/^\d{6}$/.test(passcodeStr)) {
          return NextResponse.json({ error: "入会密码必须是6位数字" }, { status: 400 });
        }
        finalPasscode = passcodeStr;
      }
    }

    const ownerName = session.displayName || session.name;
    const fallbackTeacher = {
      teacherId: session.userId,
      teacherName: ownerName,
      teacherAvatar: session.avatar || "",
    };
    const primaryTeacherSpecified =
      primaryTeacher !== undefined ||
      primaryTeacherId !== undefined ||
      primaryTeacherName !== undefined;
    const primaryTeacherInput = primaryTeacherSpecified
      ? primaryTeacher ?? {
          teacherId: primaryTeacherId,
          teacherName: primaryTeacherName,
        }
      : fallbackTeacher;
    let normalizedTeachers = normalizeCourseTeachers(
      primaryTeacherInput,
      Array.isArray(teachers)
        ? teachers
        : Array.isArray(teacherIds)
          ? teacherIds.map((teacherId: string) => ({ teacherId }))
          : []
    );
    if (normalizedTeachers.length === 0) {
      normalizedTeachers = normalizeCourseTeachers(fallbackTeacher);
    }
    const leadTeacher = normalizedTeachers[0] ?? fallbackTeacher;

    if (creationRequestId) {
      const existingRequest = await prisma.course.findUnique({
        where: { creationRequestId },
        include: {
          teachers: { orderBy: { createdAt: "asc" } },
          sessions: { orderBy: { position: "asc" } },
        },
      });
      if (existingRequest) {
        return NextResponse.json({
          course: serializeCourse(existingRequest),
          duplicate: true,
        });
      }
    }

    // Backend double-submit protection: check if a course with same owner, name, startTime, and endTime was created within the last 5 seconds
    const existing = await prisma.course.findFirst({
      where: {
        ownerId: session.userId,
        name: name.trim(),
        courseKind: normalizedCourseKind,
        createdAt: {
          gte: new Date(Date.now() - 5000), // created in last 5 seconds
        },
      },
    });
    if (existing) {
      return NextResponse.json({ error: "检测到重复提交，请勿在 5 秒内重复创建相同课程" }, { status: 409 });
    }

    const initialRoomUuid = parsedStartTime ? generateCourseRoomUuid() : null;
    const course = await prisma.course.create({
      data: {
        roomUuid: initialRoomUuid,
        name: name.trim(),
        description: description?.trim() || "",
        roomType: roomType ?? 0,
        passcode: finalPasscode,
        ownerId: session.userId,
        ownerName,
        ownerAvatar: session.avatar || "",
        teacherId: leadTeacher.teacherId,
        teacherName: leadTeacher.teacherName,
        teacherAvatar: leadTeacher.teacherAvatar,
        creationRequestId,
        courseKind: normalizedCourseKind,
        lifecycleStatus: parsedStartTime ? "active" : "draft",
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        studentRemarks: studentRemarks?.trim() || "",
        teachers: {
          create: normalizedTeachers.map((teacher) => ({
            teacherId: teacher.teacherId,
            teacherName: teacher.teacherName,
            teacherAvatar: teacher.teacherAvatar,
          })),
        },
        ...(parsedStartTime && parsedEndTime && initialRoomUuid
          ? {
              sessions: {
                create: {
                  title: `${name.trim()} · 第 1 课`,
                  position: 1,
                  roomUuid: initialRoomUuid,
                  roomType: roomType ?? 0,
                  leadTeacherId: leadTeacher.teacherId,
                  leadTeacherName: leadTeacher.teacherName,
                  leadTeacherAvatar: leadTeacher.teacherAvatar,
                  startTime: parsedStartTime,
                  endTime: parsedEndTime,
                  createdBy: session.userId,
                },
              },
            }
          : {}),
      },
      include: {
        teachers: { orderBy: { createdAt: "asc" } },
        sessions: { orderBy: { position: "asc" } },
      },
    });

    return NextResponse.json({ course: serializeCourse(course) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create course:", error);
    if (creationRequestId) {
      const existingRequest = await prisma.course
        .findUnique({
          where: { creationRequestId },
          include: {
            teachers: { orderBy: { createdAt: "asc" } },
            sessions: { orderBy: { position: "asc" } },
          },
        })
        .catch(() => null);
      if (existingRequest) {
        return NextResponse.json({
          course: serializeCourse(existingRequest),
          duplicate: true,
        });
      }
    }
    const unavailable = databaseUnavailableResponse(error);
    if (unavailable) return unavailable;
    return NextResponse.json({ error: "Failed to create course" }, { status: 500 });
  }
}
