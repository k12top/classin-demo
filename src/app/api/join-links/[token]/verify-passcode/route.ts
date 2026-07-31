import { NextRequest, NextResponse } from "next/server";
import {
  ensureShareLinkCourseAccess,
} from "@/lib/course-enrollment";
import { prisma } from "@/lib/db";
import { getServerTranslation } from "@/lib/i18n/server";
import {
  createShareAccessToken,
  isJoinLinkPurpose,
  joinLinkStatus,
  passcodesMatch,
  recordJoinLinkUse,
} from "@/lib/join-link";
import { getSessionFromRequest } from "@/lib/session";
import { resolveCourseSessionAccess } from "@/lib/course-session-access";
import { resolveCourseSessionReference } from "@/lib/course-session-roster";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const purpose = isJoinLinkPurpose(body.purpose) ? body.purpose : null;
  const passcode = typeof body.passcode === "string" ? body.passcode.trim() : "";
  const embed = body.embed === true || body.embed === "1";
  const lang = typeof body.lang === "string" ? body.lang : undefined;
  const { t } = await getServerTranslation(lang);

  if (!purpose) {
    return NextResponse.json({ error: "Invalid link purpose" }, { status: 400 });
  }

  const link = await prisma.courseJoinLink.findUnique({
    where: { token: token.trim() },
    select: {
      id: true,
      courseId: true,
      sessionId: true,
      purpose: true,
      passcode: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!link || link.purpose !== purpose || joinLinkStatus(link) !== "active") {
    return NextResponse.json({ error: t("join.notFound") }, { status: 404 });
  }

  if (link.passcode && !passcodesMatch(link.passcode, passcode)) {
    return NextResponse.json(
      { error: t("passcodeGate.errInvalidPasscode") },
      { status: 400 }
    );
  }

  const course = await prisma.course.findUnique({
    where: { id: link.courseId },
    include: {
      teachers: { select: { teacherId: true } },
      students: { select: { studentId: true } },
      groupLinks: {
        include: {
          group: {
            include: {
              members: { select: { userId: true } },
            },
          },
        },
      },
    },
  });

  if (!course) {
    return NextResponse.json({ error: t("join.courseNotExist") }, { status: 404 });
  }

  if (purpose === "course") {
    const access = await ensureShareLinkCourseAccess(course, session);

    await recordJoinLinkUse(link.id);
    return NextResponse.json({
      success: true,
      role: access.role,
      redirectTo: `/courses/${course.id}`,
    });
  }

  const lesson = await resolveCourseSessionReference(link.sessionId || course.id);
  if (!lesson || lesson.courseId !== course.id) {
    return NextResponse.json({ error: t("join.courseNotExist") }, { status: 404 });
  }
  let access = await resolveCourseSessionAccess(lesson.id, session.userId, {
    userIdAliases: [session.name],
  });
  if (!access.ok && access.code !== "not_enrolled") {
    return NextResponse.json(
      { error: access.reason, code: access.code },
      { status: access.httpStatus === 404 ? 404 : 403 }
    );
  }

  if (!access.ok && access.code === "not_enrolled") {
    await prisma.courseSessionStudent.upsert({
      where: {
        sessionId_studentId: {
          sessionId: lesson.id,
          studentId: session.userId,
        },
      },
      create: {
        courseId: course.id,
        sessionId: lesson.id,
        studentId: session.userId,
        studentName: session.displayName || session.name || session.userId,
        studentAvatar: session.avatar || "",
        action: "include",
      },
      update: {
        studentName: session.displayName || session.name || session.userId,
        studentAvatar: session.avatar || "",
        action: "include",
      },
    });
    access = await resolveCourseSessionAccess(lesson.id, session.userId, {
      userIdAliases: [session.name],
    });
  }
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason, code: access.code },
      { status: access.httpStatus === 404 ? 404 : 403 },
    );
  }

  const shareAccess = createShareAccessToken({
    userId: session.userId,
    courseId: course.id,
    sessionId: lesson.id,
    linkId: link.id,
  });
  const qs = new URLSearchParams({
    sessionId: lesson.id,
    shareAccess,
  });
  if (embed) qs.set("embed", "1");
  if (lang) qs.set("lang", lang);

  await recordJoinLinkUse(link.id);
  return NextResponse.json({
    success: true,
    redirectTo: `/classroom?${qs.toString()}`,
  });
}
