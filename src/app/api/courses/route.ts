/**
 * Course list & create API
 * GET  /api/courses — list courses (teacher: own; student: enrolled)
 * POST /api/courses — create a new course (teacher only)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import { buildCourseShareUrl, buildJoinUrl, joinLinkStatus } from "@/lib/join-link";
import { serializeCourse, serializeCourses } from "@/lib/course-serialize";
import { promoteCoursesIfDue } from "@/lib/course-promote";
import {
  applyCourseListSort,
  courseListOrderBy,
  courseListStatusWhere,
  parseCourseListSort,
  parseCourseStatusFilter,
} from "@/lib/course-list-query";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
    // Auto-promote any overdue course statuses before listing
    await promoteCoursesIfDue();

    if (session.role === "teacher") {
      // Teacher sees all their own courses (all statuses)
      const coursesRaw = await prisma.course.findMany({
        where: { teacherId: session.userId, ...statusWhere },
        include: {
          students: { select: { studentId: true, studentName: true } },
          groupLinks: {
            include: {
              group: { select: { id: true, name: true } },
            },
          },
          joinLinks: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              token: true,
              purpose: true,
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
        coursesRaw.map(({ joinLinks, ...course }) => ({
          ...course,
          activeJoinLinks: joinLinks
            .filter((l) => joinLinkStatus(l) === "active" && l.purpose !== "course")
            .map((l) => ({
              id: l.id,
              label: l.label,
              joinUrl: buildJoinUrl(origin, l.token),
              useCount: l.useCount,
            })),
          activeCourseShareLinks: joinLinks
            .filter((l) => joinLinkStatus(l) === "active" && l.purpose === "course")
            .map((l) => ({
              id: l.id,
              label: l.label,
              courseShareUrl: buildCourseShareUrl(origin, l.token),
              useCount: l.useCount,
            })),
        })),
        sortParsed
      );
      return NextResponse.json(
        { courses: serializeCourses(courses) },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0, must-revalidate",
          },
        }
      );
    } else {
      // Student sees courses they're assigned to plus public classes.
      const directCourses = await prisma.course.findMany({
        where: {
          students: { some: { studentId: session.userId } },
          ...statusWhere,
        },
        include: {
          students: { select: { studentId: true, studentName: true } },
        },
        orderBy,
      });

      // Also find courses via group membership
      const groupMemberships = await prisma.groupMember.findMany({
        where: { userId: session.userId },
        select: { groupId: true },
      });
      const groupIds = groupMemberships.map((m: { groupId: string }) => m.groupId);

      let groupCourses: typeof directCourses = [];
      if (groupIds.length > 0) {
        groupCourses = await prisma.course.findMany({
          where: {
            groupLinks: { some: { groupId: { in: groupIds } } },
            NOT: { students: { some: { studentId: session.userId } } },
            ...statusWhere,
          },
          include: {
            students: { select: { studentId: true, studentName: true } },
          },
          orderBy,
        });
      }

      const publicCourses = await prisma.course.findMany({
        where: {
          roomType: 10,
          NOT: {
            OR: [
              { students: { some: { studentId: session.userId } } },
              ...(groupIds.length > 0
                ? [{ groupLinks: { some: { groupId: { in: groupIds } } } }]
                : []),
            ],
          },
          ...statusWhere,
        },
        include: {
          students: { select: { studentId: true, studentName: true } },
        },
        orderBy,
      });

      const courses = applyCourseListSort(
        [
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
        ],
        sortParsed
      );
      return NextResponse.json(
        { courses: serializeCourses(courses) },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0, must-revalidate",
          },
        }
      );
    }
  } catch (error) {
    console.error("Failed to fetch courses:", error);
    return NextResponse.json({ error: "Failed to fetch courses" }, { status: 500 });
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
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    }

    if (!startTime) {
      return NextResponse.json({ error: "开始时间不能为空" }, { status: 400 });
    }
    if (!endTime) {
      return NextResponse.json({ error: "结束时间不能为空" }, { status: 400 });
    }

    const parsedStartTime = new Date(startTime);
    const parsedEndTime = new Date(endTime);
    if (Number.isNaN(parsedStartTime.getTime()) || Number.isNaN(parsedEndTime.getTime())) {
      return NextResponse.json({ error: "课程时间格式无效" }, { status: 400 });
    }
    if (parsedStartTime < new Date(Date.now() - 120000)) {
      return NextResponse.json({ error: "开始时间不能早于当前时间" }, { status: 400 });
    }
    if (parsedEndTime <= parsedStartTime) {
      return NextResponse.json({ error: "结束时间必须晚于开始时间" }, { status: 400 });
    }
    if (parsedEndTime < new Date()) {
      return NextResponse.json({ error: "结束时间不能早于当前时间" }, { status: 400 });
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

    // Backend double-submit protection: check if a course with same teacher, name, startTime, and endTime was created within the last 5 seconds
    const existing = await prisma.course.findFirst({
      where: {
        teacherId: session.userId,
        name: name.trim(),
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        createdAt: {
          gte: new Date(Date.now() - 5000), // created in last 5 seconds
        },
      },
    });
    if (existing) {
      return NextResponse.json({ error: "检测到重复提交，请勿在 5 秒内重复创建相同课程" }, { status: 409 });
    }

    const course = await prisma.course.create({
      data: {
        name: name.trim(),
        description: description?.trim() || "",
        roomType: roomType ?? 0,
        passcode: finalPasscode,
        teacherId: session.userId,
        teacherName: session.displayName || session.name,
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        studentRemarks: studentRemarks?.trim() || "",
      },
    });

    return NextResponse.json({ course: serializeCourse(course) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create course:", error);
    return NextResponse.json({ error: "Failed to create course" }, { status: 500 });
  }
}
