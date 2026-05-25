/**
 * Course list & create API
 * GET  /api/courses — list courses (teacher: own; student: enrolled)
 * POST /api/courses — create a new course (teacher only)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import { buildJoinUrl, joinLinkStatus } from "@/lib/join-link";
import { serializeCourse, serializeCourses } from "@/lib/course-serialize";
import { promoteCoursesIfDue } from "@/lib/course-promote";
import {
  applyCourseListSort,
  courseListOrderBy,
  courseListStatusWhere,
  parseCourseListSort,
  parseCourseStatusFilter,
} from "@/lib/course-list-query";

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
            .filter((l) => joinLinkStatus(l) === "active")
            .map((l) => ({
              id: l.id,
              label: l.label,
              joinUrl: buildJoinUrl(origin, l.token),
              useCount: l.useCount,
            })),
        })),
        sortParsed
      );
      return NextResponse.json({ courses: serializeCourses(courses) });
    } else {
      // Student sees courses they're directly assigned to (all statuses)
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

      const courses = applyCourseListSort(
        [...directCourses, ...groupCourses],
        sortParsed
      );
      return NextResponse.json({ courses: serializeCourses(courses) });
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
    const { name, description, roomType, startTime, endTime, studentRemarks } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    }

    const course = await prisma.course.create({
      data: {
        name: name.trim(),
        description: description?.trim() || "",
        roomType: roomType ?? 0,
        teacherId: session.userId,
        teacherName: session.displayName || session.name,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        studentRemarks: studentRemarks?.trim() || "",
      },
    });

    return NextResponse.json({ course: serializeCourse(course) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create course:", error);
    return NextResponse.json({ error: "Failed to create course" }, { status: 500 });
  }
}
