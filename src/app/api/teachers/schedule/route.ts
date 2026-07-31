import { NextRequest, NextResponse } from "next/server";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_TEACHERS = 20;
const MAX_RANGE_DAYS = 31;

function requestedTeacherIds(request: NextRequest, fallback: string) {
  const values = request.nextUrl.searchParams
    .getAll("teacherId")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(values.length ? values : [fallback])).slice(0, MAX_TEACHERS);
}

function validRange(request: NextRequest) {
  const now = new Date();
  const fallbackFrom = new Date(now);
  fallbackFrom.setHours(0, 0, 0, 0);
  const fallbackTo = new Date(fallbackFrom);
  fallbackTo.setDate(fallbackTo.getDate() + 7);
  const from = new Date(request.nextUrl.searchParams.get("from") || fallbackFrom);
  const to = new Date(request.nextUrl.searchParams.get("to") || fallbackTo);
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    to <= from ||
    to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000
  ) {
    return null;
  }
  return { from, to };
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can view teaching schedules" }, { status: 403 });
  }

  const range = validRange(request);
  if (!range) return NextResponse.json({ error: "Invalid schedule range" }, { status: 400 });
  const teacherIds = requestedTeacherIds(request, session.userId);
  const candidates = Array.from(
    new Set(teacherIds.flatMap((teacherId) => casdoorUserIdCandidates(teacherId))),
  );

  const [lessons, blocks] = await Promise.all([
    prisma.courseSession.findMany({
      where: {
        startTime: { lt: range.to },
        endTime: { gt: range.from },
        status: { not: "cancelled" },
        OR: [
          { leadTeacherId: { in: candidates } },
          { teachers: { some: { teacherId: { in: candidates } } } },
          { course: { teacherId: { in: candidates } } },
          { course: { teachers: { some: { teacherId: { in: candidates } } } } },
        ],
      },
      select: {
        id: true,
        courseId: true,
        title: true,
        startTime: true,
        endTime: true,
        teacherMode: true,
        leadTeacherId: true,
        teachers: {
          select: { teacherId: true, action: true },
        },
        course: {
          select: {
            name: true,
            teacherId: true,
            teachers: { select: { teacherId: true } },
          },
        },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.teacherScheduleBlock.findMany({
      where: {
        teacherId: { in: candidates },
        startTime: { lt: range.to },
        endTime: { gt: range.from },
      },
      orderBy: { startTime: "asc" },
    }),
  ]);

  const schedules = teacherIds.map((teacherId) => {
    const lessonEvents = lessons.flatMap((lesson) => {
      const matchingRules = lesson.teachers.filter((rule) =>
        casdoorUserIdsMatch(rule.teacherId, teacherId),
      );
      const explicitlyIncluded = matchingRules.some((rule) => rule.action === "include");
      const explicitlyExcluded = matchingRules.some((rule) => rule.action === "exclude");
      const isLead = Boolean(
        lesson.leadTeacherId && casdoorUserIdsMatch(lesson.leadTeacherId, teacherId),
      );
      const inherited =
        lesson.teacherMode === "inherit" &&
        !explicitlyExcluded &&
        (casdoorUserIdsMatch(lesson.course.teacherId, teacherId) ||
          lesson.course.teachers.some((teacher) =>
            casdoorUserIdsMatch(teacher.teacherId, teacherId),
          ));
      if (!isLead && !explicitlyIncluded && !inherited) return [];
      return [{
        id: `course:${lesson.id}`,
        kind: "course" as const,
        title: lesson.title || lesson.course.name,
        startTime: lesson.startTime.toISOString(),
        endTime: lesson.endTime.toISOString(),
        courseId: lesson.courseId,
        sessionId: lesson.id,
      }];
    });
    const planEvents = blocks
      .filter((block) => casdoorUserIdsMatch(block.teacherId, teacherId))
      .map((block) => ({
        id: block.id,
        kind: block.kind === "available" ? "available" as const : "busy" as const,
        title: block.title,
        startTime: block.startTime.toISOString(),
        endTime: block.endTime.toISOString(),
      }));
    return {
      teacherId,
      events: [...lessonEvents, ...planEvents].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      ),
    };
  });

  return NextResponse.json(
    {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      schedules,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "teacher") {
    return NextResponse.json({ error: "Only teachers can edit their plan" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const kind = body?.kind === "available" ? "available" : body?.kind === "busy" ? "busy" : null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 80) : "";
  const timezone = typeof body?.timezone === "string"
    ? body.timezone.trim().slice(0, 64)
    : "Asia/Shanghai";
  const startTime = new Date(body?.startTime);
  const endTime = new Date(body?.endTime);
  if (
    !kind ||
    Number.isNaN(startTime.getTime()) ||
    Number.isNaN(endTime.getTime()) ||
    endTime <= startTime ||
    endTime.getTime() - startTime.getTime() > 24 * 60 * 60 * 1000
  ) {
    return NextResponse.json({ error: "Invalid teaching plan block" }, { status: 400 });
  }

  const block = await prisma.teacherScheduleBlock.create({
    data: {
      teacherId: session.userId,
      kind,
      title,
      startTime,
      endTime,
      timezone,
    },
  });
  return NextResponse.json(
    {
      block: {
        ...block,
        startTime: block.startTime.toISOString(),
        endTime: block.endTime.toISOString(),
        createdAt: block.createdAt.toISOString(),
        updatedAt: block.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
