/**
 * Revoke a course join link
 * DELETE /api/courses/:id/join-links/:linkId
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { assertTeacherOwnsCourse } from "@/lib/course-teacher";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId, linkId } = await params;
  if (!(await assertTeacherOwnsCourse(session.userId, courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.courseJoinLink.findFirst({
    where: { id: linkId, courseId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.revokedAt) {
    return NextResponse.json({ ok: true });
  }

  await prisma.courseJoinLink.update({
    where: { id: linkId },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
