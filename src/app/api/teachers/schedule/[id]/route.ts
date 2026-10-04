import { NextRequest, NextResponse } from "next/server";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can edit their plan" }, { status: 403 });
  }
  const { id } = await params;
  const block = await prisma.teacherScheduleBlock.findUnique({
    where: { id },
    select: { id: true, teacherId: true },
  });
  if (!block || !casdoorUserIdsMatch(block.teacherId, session.userId)) {
    return NextResponse.json({ error: "Plan block not found" }, { status: 404 });
  }
  await prisma.teacherScheduleBlock.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
