/**
 * Course-share entry: valid token + auth session -> enroll student -> course page.
 */
import { redirect } from "next/navigation";
import JoinLinkPasscodeGate from "@/components/JoinLinkPasscodeGate";
import { ShareLinkError } from "@/components/ShareLinkError";
import { ensureShareLinkCourseAccess } from "@/lib/course-enrollment";
import { prisma } from "@/lib/db";
import { getServerTranslation } from "@/lib/i18n/server";
import {
  buildCourseSharePath,
  recordJoinLinkUse,
  resolveJoinLinkForPurpose,
} from "@/lib/join-link";
import { getSession } from "@/lib/session";

export default async function CourseSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { token } = await params;
  const { lang: langParam } = await searchParams;
  const { t } = await getServerTranslation(langParam);
  const copy = {
    closedTitle: t("join.courseUnavailable"),
    closedMessage: t("join.courseClosedMessage"),
    closedHint: t("join.courseClosedHint"),
    invalidHint: t("join.invalidCourseShareHint"),
    linkLabel: t("join.courseShareLabel"),
    detailLabel: t("accessDenied.viewDetail"),
    passcodeTitle: t("join.coursePasscodeTitle"),
    passcodeDesc: t("join.coursePasscodeDescription"),
    passcodeButton: t("join.coursePasscodeButton"),
  };

  const resolved = await resolveJoinLinkForPurpose(token, "course");
  if (!resolved.ok) {
    const messages: Record<typeof resolved.reason, string> = {
      not_found: t("join.notFound"),
      revoked: t("join.revoked"),
      expired: t("join.expired"),
    };
    return (
      <ShareLinkError
        title={t("accessDenied.title")}
        message={messages[resolved.reason]}
        hint={copy.invalidHint}
        backLabel={t("common.backToHome")}
        linkLabel={copy.linkLabel}
        tone="neutral"
      />
    );
  }

  const session = await getSession();
  if (!session) {
    const next = buildCourseSharePath(token, langParam);
    redirect(`/api/auth/login?next=${encodeURIComponent(next)}`);
  }

  const course = await prisma.course.findUnique({
    where: { id: resolved.courseId },
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
    return (
      <ShareLinkError
        title={t("accessDenied.title")}
        message={t("join.courseNotExist")}
        hint={copy.invalidHint}
        backLabel={t("common.backToHome")}
        linkLabel={copy.linkLabel}
        tone="neutral"
      />
    );
  }

  if (course.lifecycleStatus === "archived") {
    return (
      <ShareLinkError
        title={copy.closedTitle}
        message={copy.closedMessage}
        hint={copy.closedHint}
        backLabel={t("common.backToHome")}
        linkLabel={copy.linkLabel}
        courseName={course.name}
        detailHref={`/courses/${course.id}`}
        detailLabel={copy.detailLabel}
      />
    );
  }

  if (resolved.requiresPasscode) {
    return (
      <JoinLinkPasscodeGate
        token={token}
        purpose="course"
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
        lang={langParam}
      />
    );
  }

  await ensureShareLinkCourseAccess(course, session);

  await recordJoinLinkUse(resolved.linkId);
  redirect(`/courses/${course.id}`);
}
