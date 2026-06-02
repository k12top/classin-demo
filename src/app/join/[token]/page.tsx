/**
 * Share-link entry: valid token + Casdoor session + course access → live classroom.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import {
  courseIdToRoomUuid,
  resolveCourseAccess,
} from "@/lib/course-access";
import { buildAccessDeniedUrl } from "@/lib/access-denied-codes";
import { recordJoinLinkUse, resolveJoinLink } from "@/lib/join-link";
import { prisma } from "@/lib/db";
import { getServerTranslation } from "@/lib/i18n/server";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { token } = await params;
  const { embed: embedParam } = await searchParams;
  const wantEmbed = embedParam === "1" || embedParam === "true";
  const { t } = await getServerTranslation();

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
    redirect(`/api/auth/login?next=${encodeURIComponent(wantEmbed ? `/join/${token}?embed=1` : `/join/${token}`)}`);
  }

  const access = await resolveCourseAccess(resolved.courseId, session.userId);
  if (!access.ok) {
    redirect(
      buildAccessDeniedUrl({
        code: access.code,
        reason: access.reason,
        course: t("teacherDashboard.fieldName"),
        courseId: resolved.courseId,
      })
    );
  }

  const course = await prisma.course.findUnique({
    where: { id: resolved.courseId },
    select: { id: true, name: true, roomType: true },
  });
  if (!course) {
    redirect(
      buildAccessDeniedUrl({
        code: "not_found",
        reason: t("join.courseNotExist"),
      })
    );
  }

  await recordJoinLinkUse(resolved.linkId);

  const roomUuid = courseIdToRoomUuid(course.id);
  const qs = new URLSearchParams({
    roomUuid,
    roomType: String(course.roomType),
    roomName: course.name,
    courseId: course.id,
  });
  if (wantEmbed) {
    qs.set("embed", "1");
  }

  redirect(`/classroom?${qs.toString()}`);
}
