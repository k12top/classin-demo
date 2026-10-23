import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";
import {
  attachSessionCookies,
  buildSessionCookies,
  getSessionFromRequest,
} from "@/lib/session";
import { upsertUserProfileAvatar } from "@/lib/user-profile";
import { CoursewareStorageConfigurationError } from "@/lib/aliyun-oss";
import { presetAvatarSource } from "@/lib/user-avatar";
import { MAX_AVATAR_SIZE, validateAvatarFile } from "@/lib/avatar-upload";
import { matchesAvatarContentType, storeAvatar } from "@/lib/avatar-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    let avatar: string;
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if (Number(request.headers.get("content-length")) > MAX_AVATAR_SIZE + 64 * 1024) {
        return NextResponse.json({ code: "AVATAR_FILE_TOO_LARGE" }, { status: 413 });
      }
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return NextResponse.json({ code: "AVATAR_FILE_REQUIRED" }, { status: 400 });
      }
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ code: "AVATAR_FILE_REQUIRED" }, { status: 400 });
      }
      const code = validateAvatarFile(file);
      if (code) {
        return NextResponse.json({ code }, { status: code === "AVATAR_FILE_TOO_LARGE" ? 413 : 400 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!matchesAvatarContentType(bytes, file.type)) {
        return NextResponse.json({ code: "AVATAR_FILE_TYPE_INVALID" }, { status: 400 });
      }
      avatar = await storeAvatar(bytes, file.type);
    } else {
      // Preserve existing clients that update or clear their avatar using JSON.
      const body = await request.json();
      const normalized = body?.preset !== undefined ? presetAvatarSource(body.preset) : normalizeAvatarUrl(body?.avatar);
      if (normalized === null) {
        return NextResponse.json({ error: "Invalid avatar URL" }, { status: 400 });
      }
      avatar = normalized;
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
      prisma.courseSession.updateMany({
        where: { leadTeacherId: { in: userIdCandidates } },
        data: { leadTeacherAvatar: avatar },
      }),
      prisma.courseSessionTeacher.updateMany({
        where: { teacherId: { in: userIdCandidates } },
        data: { teacherAvatar: avatar },
      }),
      prisma.courseSessionStudent.updateMany({
        where: { studentId: { in: userIdCandidates } },
        data: { studentAvatar: avatar },
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
    if (error instanceof CoursewareStorageConfigurationError) {
      return NextResponse.json({ code: "AVATAR_STORAGE_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to update avatar" }, { status: 500 });
  }
}
