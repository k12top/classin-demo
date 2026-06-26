import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";
import {
  attachSessionCookies,
  buildSessionCookies,
  getSessionFromRequest,
} from "@/lib/session";
import { upsertUserProfileAvatar } from "@/lib/user-profile";

export const dynamic = "force-dynamic";

function normalizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const avatar = value.trim();
  if (!avatar) return "";
  if (avatar.length > 2048) return null;

  try {
    const url = new URL(avatar);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export async function PUT(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const avatar = normalizeAvatarUrl(body?.avatar);
    if (avatar === null) {
      return NextResponse.json({ error: "Invalid avatar URL" }, { status: 400 });
    }

    const userIdCandidates = casdoorUserIdCandidates(session.userId);
    await upsertUserProfileAvatar({
      userId: session.userId,
      displayName: session.displayName || session.name,
      avatar,
      role: session.role,
      email: session.email,
    });

    await prisma.$transaction([
      prisma.course.updateMany({
        where: { ownerId: { in: userIdCandidates } },
        data: { ownerAvatar: avatar },
      }),
      prisma.course.updateMany({
        where: { teacherId: { in: userIdCandidates } },
        data: { teacherAvatar: avatar },
      }),
      prisma.courseTeacher.updateMany({
        where: { teacherId: { in: userIdCandidates } },
        data: { teacherAvatar: avatar },
      }),
      prisma.courseStudent.updateMany({
        where: { studentId: { in: userIdCandidates } },
        data: { studentAvatar: avatar },
      }),
      prisma.groupMember.updateMany({
        where: { userId: { in: userIdCandidates } },
        data: { userAvatar: avatar },
      }),
    ]);

    const built = await buildSessionCookies({
      userId: session.userId,
      name: session.name,
      displayName: session.displayName,
      avatar,
      role: session.role,
      email: session.email,
    });
    const response = NextResponse.json({ avatar });
    attachSessionCookies(response, built);
    return response;
  } catch (error) {
    console.error("Failed to update avatar:", error);
    return NextResponse.json({ error: "Failed to update avatar" }, { status: 500 });
  }
}
