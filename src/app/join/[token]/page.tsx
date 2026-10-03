/**
 * Live share-link entry: valid token + auth session + course access -> live classroom.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import JoinLinkPasscodeGate from "@/components/JoinLinkPasscodeGate";
import { getSession } from "@/lib/session";
import {
  courseIdToRoomUuid,
  resolveCourseAccess,
} from "@/lib/course-access";
import { buildAccessDeniedUrl } from "@/lib/access-denied-codes";
import { ensureStudentEnrolledInCourse } from "@/lib/course-enrollment";
import {
  createShareAccessToken,
  recordJoinLinkUse,
  resolveJoinLink,
} from "@/lib/join-link";
import { prisma } from "@/lib/db";
import { getServerTranslation } from "@/lib/i18n/server";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ embed?: string; lang?: string }>;
}) {
  const { token } = await params;
  const { embed: embedParam, lang: langParam } = await searchParams;
  const wantEmbed = embedParam === "1" || embedParam === "true";
  const { locale, t } = await getServerTranslation(langParam);
  const copy =
    locale === "zh-CN"
      ? {
          linkLabel: "直播分享链接",
          passcodeTitle: "输入密码进入直播",
          passcodeDesc:
            "老师为这个直播分享链接设置了入会密码，请输入 6 位数字密码继续。",
          passcodeButton: "验证并进入",
        }
      : {
          linkLabel: "Live share link",
          passcodeTitle: "Enter passcode to join live",
          passcodeDesc:
            "The teacher protected this live share link. Enter the 6-digit passcode to continue.",
          passcodeButton: "Verify and enter",
        };

  const resolved = await resolveJoinLink(token);
  if (!resolved.ok) {
    const messages: Record<typeof resolved.reason, string> = {
      not_found: t("join.notFound"),
      revoked: t("join.revoked"),
      expired: t("join.expired"),
    };
    return (
      <>
        <div className="page-bg" />
        <div className="auth-container">
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            <h2>{t("classroom.launchError")}</h2>
            <p style={{ marginTop: 12, color: "var(--color-text-secondary)" }}>
              {messages[resolved.reason]}
            </p>
            <Link href="/" className="btn btn-primary" style={{ marginTop: 24, display: "inline-block" }}>
              {t("common.backToHome")}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const session = await getSession();
  if (!session) {
    const nextPath = `/join/${token}`;
    const nextQs = new URLSearchParams();
    if (wantEmbed) nextQs.set("embed", "1");
    if (langParam) nextQs.set("lang", langParam);
    const next = nextQs.size > 0 ? `${nextPath}?${nextQs.toString()}` : nextPath;
    redirect(`/api/auth/login?next=${encodeURIComponent(next)}`);
  }

  const course = await prisma.course.findUnique({
    where: { id: resolved.courseId },
    select: {
      id: true,
      roomUuid: true,
      name: true,
      roomType: true,
      teacherName: true,
    },
  });
  if (!course) {
    redirect(
      buildAccessDeniedUrl({
        code: "not_found",
        reason: t("join.courseNotExist"),
      })
    );
  }

  if (resolved.requiresPasscode) {
    return (
      <JoinLinkPasscodeGate
        token={token}
        purpose="live"
        title={copy.passcodeTitle}
        description={copy.passcodeDesc}
        linkLabel={copy.linkLabel}
        buttonLabel={copy.passcodeButton}
        backLabel={t("common.backToHome")}
        errorFallback={t("passcodeGate.errInvalidPasscode")}
        courseName={course.name}
        teacherName={t("courseDetail.teacherInfo").replace(
          "{name}",
          course.teacherName
        )}
        embed={wantEmbed}
        lang={langParam}
      />
    );
  }

  const access = await resolveCourseAccess(resolved.courseId, session.userId, {
    userIdAliases: [session.name],
  });
  if (!access.ok) {
    if (access.code === "not_enrolled") {
      await ensureStudentEnrolledInCourse(course.id, session);
      await recordJoinLinkUse(resolved.linkId);
      const shareAccess = createShareAccessToken({
        userId: session.userId,
        courseId: course.id,
        linkId: resolved.linkId,
      });
      const roomUuid = courseIdToRoomUuid(course.id, course.roomUuid);
      const qs = new URLSearchParams({
        roomUuid,
        roomType: String(course.roomType),
        roomName: course.name,
        courseId: course.id,
        shareAccess,
      });
      if (wantEmbed) qs.set("embed", "1");
      if (langParam) qs.set("lang", langParam);
      redirect(`/classroom?${qs.toString()}`);
    }
    redirect(
      buildAccessDeniedUrl({
        code: access.code,
        reason: access.reason,
        course: t("teacherDashboard.fieldName"),
        courseId: resolved.courseId,
      })
    );
  }

  await recordJoinLinkUse(resolved.linkId);

  const qs = new URLSearchParams({
    roomUuid: access.roomUuid,
    roomType: String(course.roomType),
    roomName: course.name,
    courseId: course.id,
  });
  if (wantEmbed) {
    qs.set("embed", "1");
  }
  if (langParam) {
    qs.set("lang", langParam);
  }

  redirect(`/classroom?${qs.toString()}`);
}
