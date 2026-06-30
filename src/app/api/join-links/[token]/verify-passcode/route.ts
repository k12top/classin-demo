import { NextRequest, NextResponse } from "next/server";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import {
  courseIdToRoomUuid,
  resolveCourseAccess,
} from "@/lib/course-access";
import { canEnterClassroom } from "@/lib/course-status";
import { promoteCourseIfDueById } from "@/lib/course-promote";
import { userCanTeachCourse } from "@/lib/course-teacher";
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

  await promoteCourseIfDueById(link.courseId);
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

  if (!canEnterClassroom(course.status)) {
    return NextResponse.json(
      { error: t("join.courseNotExist") },
      { status: 403 }
    );
  }

  if (purpose === "course") {
    const isTeacher = userCanTeachCourse(course, session.userId);
    const isDirectStudent = course.students.some((student) =>
      casdoorUserIdsMatch(student.studentId, session.userId)
    );
    const isGroupStudent = course.groupLinks.some((link) =>
      link.group.members.some((member) =>
        casdoorUserIdsMatch(member.userId, session.userId)
      )
    );

    if (!isTeacher && !isDirectStudent && !isGroupStudent) {
      await prisma.courseStudent.createMany({
        data: [
          {
            courseId: course.id,
            studentId: session.userId,
            studentName: session.displayName || session.name,
            studentAvatar: session.avatar || "",
          },
        ],
        skipDuplicates: true,
      });
    }

    await recordJoinLinkUse(link.id);
    return NextResponse.json({ success: true, redirectTo: `/courses/${course.id}` });
  }

  const access = await resolveCourseAccess(course.id, session.userId);
  if (!access.ok && access.code !== "not_enrolled") {
    return NextResponse.json(
      { error: access.reason, code: access.code },
      { status: access.httpStatus === 404 ? 404 : 403 }
    );
  }

  const shareAccess = createShareAccessToken({
    userId: session.userId,
    courseId: course.id,
    linkId: link.id,
  });
  const roomUuid = courseIdToRoomUuid(course.id);
  const qs = new URLSearchParams({
    roomUuid,
    roomType: String(course.roomType),
    roomName: course.name,
    courseId: course.id,
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
