/**
 * Course detail, update, delete API
 * GET    /api/courses/:id
 * PUT    /api/courses/:id
 * DELETE /api/courses/:id
 */
import { NextRequest, NextResponse } from "next/server";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const course = await prisma.course.findUnique({
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

    return NextResponse.json({ course });
  } catch (error) {
    console.error("Failed to fetch course:", error);
    return NextResponse.json({ error: "Failed to fetch course" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
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
    const { name, description, roomType, status, startTime, endTime, studentRemarks } = body;

    const course = await prisma.course.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(roomType !== undefined && { roomType }),
        ...(status !== undefined && { status }),
        ...(startTime !== undefined && { startTime: startTime ? new Date(startTime) : null }),
        ...(endTime !== undefined && { endTime: endTime ? new Date(endTime) : null }),
        ...(studentRemarks !== undefined && { studentRemarks: studentRemarks.trim() }),
      },
    });

    return NextResponse.json({ course });
  } catch (error) {
    console.error("Failed to update course:", error);
    return NextResponse.json({ error: "Failed to update course" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
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
    const { status, studentRemarks } = body;
    
    const dataToUpdate: any = {};
    
    // Both can cancel. Teacher can finish.
    if (status !== undefined) {
      if (status === "cancelled" || (isTeacher && status === "finished")) {
         dataToUpdate.status = status;
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

    return NextResponse.json({ course });
  } catch (error) {
    console.error("Failed to patch course:", error);
    return NextResponse.json({ error: "Failed to patch course" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
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
