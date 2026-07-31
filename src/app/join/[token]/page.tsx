/**
 * Live share-link entry: valid token + auth session + course access -> live classroom.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowRight, Video } from "lucide-react";
import JoinLinkPasscodeGate from "@/components/JoinLinkPasscodeGate";
import { getSession } from "@/lib/session";
import {
  buildAccessDeniedUrl,
  type CourseAccessDeniedCode,
} from "@/lib/access-denied-codes";
import {
  createShareAccessToken,
  recordJoinLinkUse,
  resolveJoinLink,
} from "@/lib/join-link";
import { prisma } from "@/lib/db";
import { getServerTranslation } from "@/lib/i18n/server";
import { resolveCourseSessionAccess } from "@/lib/course-session-access";
import { resolveCourseSessionReference } from "@/lib/course-session-roster";

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
  const { t } = await getServerTranslation(langParam);
  const copy = {
    linkLabel: t("join.liveShareLabel"),
    passcodeTitle: t("join.livePasscodeTitle"),
    passcodeDesc: t("join.livePasscodeDescription"),
    passcodeButton: t("join.livePasscodeButton"),
  };

  const resolved = await resolveJoinLink(token);
  if (!resolved.ok) {
    const messages: Record<typeof resolved.reason, string> = {
      not_found: t("join.notFound"),
      revoked: t("join.revoked"),
      expired: t("join.expired"),
    };
    return (
      <main className="grid min-h-screen place-items-center bg-background px-5 py-10">
        <section className="relative w-full max-w-xl overflow-hidden rounded-[26px] border border-white/10 bg-[#15171c] p-7 text-[#f4f6f8] shadow-[0_30px_90px_rgba(12,13,17,0.24)] sm:p-10">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#7b6ff2]/25 blur-[70px]" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[#a7afbd]">
              <Video className="h-4 w-4 text-[#bcb5ff]" />
              {copy.linkLabel}
            </span>
            <div className="mt-12 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#ff5e69]/20 bg-[#ff5e69]/10 text-[#ff7a84]">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h1 className="mt-6 text-3xl font-semibold tracking-[-0.05em]">
              {t("classroom.launchError")}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-7 text-[#a7afbd]">
              {messages[resolved.reason]}
            </p>
            <Link
              href="/"
              className="mt-9 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#6c60df] px-5 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(61,48,172,0.28)] transition-transform hover:-translate-y-0.5"
            >
              {t("common.backToHome")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
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

  const lesson = await resolveCourseSessionReference(
    resolved.sessionId || resolved.courseId,
  );
  if (!lesson || lesson.courseId !== resolved.courseId) {
    redirect(buildAccessDeniedUrl({ code: "not_found", reason: t("join.courseNotExist") }));
  }

  let access = await resolveCourseSessionAccess(lesson.id, session.userId, {
    userIdAliases: [session.name],
  });
  if (!access.ok) {
    if (access.code === "not_enrolled") {
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
  }
  if (!access.ok) {
    redirect(
      buildAccessDeniedUrl({
        code: access.code as CourseAccessDeniedCode,
        reason: access.reason,
        course: t("teacherDashboard.fieldName"),
        courseId: resolved.courseId,
      })
    );
  }

  await recordJoinLinkUse(resolved.linkId);

  const shareAccess = createShareAccessToken({
    userId: session.userId,
    courseId: course.id,
    sessionId: lesson.id,
    linkId: resolved.linkId,
  });
  const qs = new URLSearchParams({
    sessionId: lesson.id,
    shareAccess,
  });
  if (wantEmbed) {
    qs.set("embed", "1");
  }
  if (langParam) {
    qs.set("lang", langParam);
  }

  redirect(`/classroom?${qs.toString()}`);
}
