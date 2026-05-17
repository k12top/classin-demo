/**
 * Student assignment API for a course
 * POST   /api/courses/:id/students — assign students
 * DELETE /api/courses/:id/students — remove a student
 */
import { NextRequest, NextResponse } from "next/server";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;

  // Verify teacher ownership
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || !casdoorUserIdsMatch(course.teacherId, session.userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { students } = body; // Array of { studentId, studentName }

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: "students array is required" }, { status: 400 });
    }

    // Use createMany with skipDuplicates to avoid conflicts
    const result = await prisma.courseStudent.createMany({
      data: students.map((s: { studentId: string; studentName?: string }) => ({
        courseId,
        studentId: s.studentId,
        studentName: s.studentName || "",
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ added: result.count });
  } catch (error) {
    console.error("Failed to assign students:", error);
    return NextResponse.json({ error: "Failed to assign students" }, { status: 500 });
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

  const { id: courseId } = await params;

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || !casdoorUserIdsMatch(course.teacherId, session.userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { studentId } = body;

    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }

    await prisma.courseStudent.deleteMany({
      where: { courseId, studentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove student:", error);
    return NextResponse.json({ error: "Failed to remove student" }, { status: 500 });
  }
}
