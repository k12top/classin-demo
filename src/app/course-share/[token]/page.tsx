/**
 * Course-share entry: valid token + Casdoor session -> enroll student -> course page.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, BookOpen, CalendarX, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { canEnterClassroom } from "@/lib/course-status";
import { promoteCourseIfDueById } from "@/lib/course-promote";
import { prisma } from "@/lib/db";
import { getServerTranslation } from "@/lib/i18n/server";
import {
  buildCourseSharePath,
  recordJoinLinkUse,
  resolveJoinLinkForPurpose,
} from "@/lib/join-link";
import { getSession } from "@/lib/session";

function CourseShareError({
  title,
  message,
  hint,
  backLabel,
  linkLabel,
  courseName,
  detailHref,
  detailLabel,
  tone = "warning",
}: {
  title: string;
  message: string;
  hint: string;
  backLabel: string;
  linkLabel: string;
  courseName?: string;
  detailHref?: string;
  detailLabel?: string;
  tone?: "warning" | "neutral";
}) {
  const toneStyles = {
    warning: {
      badge: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      iconWrap: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300",
      hint: "border-amber-500/20 bg-amber-500/10 text-amber-950 dark:text-amber-100",
      Icon: CalendarX,
    },
    neutral: {
      badge: "border-primary/20 bg-primary/10 text-primary",
      iconWrap: "border-primary/20 bg-primary/10 text-primary",
      hint: "border-border bg-muted/50 text-foreground",
      Icon: AlertCircle,
    },
  }[tone];
  const Icon = toneStyles.Icon;

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-xl flex-col items-center justify-center gap-6">
        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </span>
          <span>{linkLabel}</span>
        </div>

        <Card className="w-full overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm">
          <CardHeader className="items-center px-6 pb-4 pt-8 text-center sm:px-8">
            <div
              className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border ${toneStyles.iconWrap}`}
            >
              <Icon className="h-8 w-8" />
            </div>
            <div
              className={`mb-3 rounded-full border px-3 py-1 text-xs font-semibold ${toneStyles.badge}`}
            >
              {title}
            </div>
            <CardTitle className="max-w-md text-balance text-2xl font-bold leading-tight tracking-normal sm:text-3xl">
              {message}
            </CardTitle>
            {courseName ? (
              <p className="mt-3 max-w-md rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-sm font-medium text-foreground">
                {courseName}
              </p>
            ) : null}
          </CardHeader>

          <CardContent className="px-6 pb-6 sm:px-8">
            <div
              className={`rounded-xl border px-4 py-4 text-sm leading-6 ${toneStyles.hint}`}
            >
              {hint}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 border-t border-border/70 bg-muted/20 px-6 py-5 sm:flex-row sm:justify-center sm:px-8">
            <Button asChild className="w-full rounded-xl sm:w-auto">
              <Link href="/">
                <Home className="h-4 w-4" />
                {backLabel}
              </Link>
            </Button>
            {detailHref && detailLabel ? (
              <Button
                asChild
                variant="outline"
                className="w-full rounded-xl sm:w-auto"
              >
                <Link href={detailHref}>
                  <BookOpen className="h-4 w-4" />
                  {detailLabel}
                </Link>
              </Button>
            ) : null}
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

export default async function CourseSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { token } = await params;
  const { lang: langParam } = await searchParams;
  const { locale, t } = await getServerTranslation(langParam);
  const copy =
    locale === "zh-CN"
      ? {
          closedTitle: "课程无法加入",
          closedMessage: "这门课程已结束或已取消",
          closedHint:
            "课程分享链接只支持未结束课程自动加入。如需回放、补课或重新报名，请联系授课老师确认后续安排。",
          invalidHint: "请确认老师提供的链接是否完整，或联系老师重新发送新的课程分享链接。",
          linkLabel: "课程分享链接",
          detailLabel: "查看课程详情",
        }
      : {
          closedTitle: "Course unavailable",
          closedMessage: "This course has ended or was cancelled",
          closedHint:
            "Course share links only enroll students while a course is still active. Contact the teacher for playback, rescheduling, or a new enrollment link.",
          invalidHint:
            "Check that the link from your teacher is complete, or ask them to send a new course share link.",
          linkLabel: "Course share link",
          detailLabel: "View course details",
        };

  const resolved = await resolveJoinLinkForPurpose(token, "course");
  if (!resolved.ok) {
    const messages: Record<typeof resolved.reason, string> = {
      not_found: t("join.notFound"),
      revoked: t("join.revoked"),
      expired: t("join.expired"),
    };
    return (
      <CourseShareError
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

  await promoteCourseIfDueById(resolved.courseId);
  const course = await prisma.course.findUnique({
    where: { id: resolved.courseId },
    include: {
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
      <CourseShareError
        title={t("accessDenied.title")}
        message={t("join.courseNotExist")}
        hint={copy.invalidHint}
        backLabel={t("common.backToHome")}
        linkLabel={copy.linkLabel}
        tone="neutral"
      />
    );
  }

  if (!canEnterClassroom(course.status)) {
    return (
      <CourseShareError
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

  const isTeacher = casdoorUserIdsMatch(course.teacherId, session.userId);
  const isDirectStudent = course.students.some((student) =>
    casdoorUserIdsMatch(student.studentId, session.userId)
  );
  const isGroupStudent = course.groupLinks.some((link) =>
    link.group.members.some((member) =>
      casdoorUserIdsMatch(member.userId, session.userId)
    )
  );

  if (
    !isTeacher &&
    !isDirectStudent &&
    !isGroupStudent
  ) {
    await prisma.courseStudent.createMany({
      data: [
        {
          courseId: course.id,
          studentId: session.userId,
          studentName: session.displayName || session.name,
        },
      ],
      skipDuplicates: true,
    });
  }

  await recordJoinLinkUse(resolved.linkId);
  redirect(`/courses/${course.id}`);
}
