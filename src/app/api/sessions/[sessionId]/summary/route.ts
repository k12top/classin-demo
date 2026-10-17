import { after, NextRequest, NextResponse } from "next/server";
import { resolveCoursewareAccess } from "@/lib/courseware-access";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import {
  publicCourseSessionSummary,
  saveCourseSessionSummary,
  setCourseSessionSummaryPublished,
} from "@/lib/course-session-summary";
import { processCourseSessionSummaryGeneration, publicSummaryGeneration, queueCourseSessionSummary, summaryGenerationNeedsWorker } from "@/lib/course-session-summary-generation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Context = { params: Promise<{ sessionId: string }> };

async function resolveSummaryAccess(request: NextRequest, sessionId: string) {
  const identity = await getSessionFromRequest(request);
  if (!identity) return { error: "Unauthorized", status: 401 } as const;
  const lesson = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: { courseId: true },
  });
  if (!lesson) return { error: "Session not found", status: 404 } as const;
  const access = await resolveCoursewareAccess(identity, lesson.courseId, sessionId);
  if (!access.allowed) return { error: "Forbidden", status: 403 } as const;
  return { identity, courseId: lesson.courseId, access } as const;
}

export async function GET(request: NextRequest, context: Context) {
  const { sessionId } = await context.params;
  const resolved = await resolveSummaryAccess(request, sessionId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const summary = await prisma.courseSessionSummary.findUnique({
    where: { sessionId },
  });
  const generation = resolved.access.teaching
    ? await prisma.courseSessionSummaryGeneration.findUnique({ where: { sessionId } }) : null;
  if (summaryGenerationNeedsWorker(generation)) {
    after(() => processCourseSessionSummaryGeneration(sessionId).then(() => undefined));
  }
  const visibleSummary = summary && (resolved.access.teaching || summary.status === "published")
    ? publicCourseSessionSummary(summary)
    : null;
  if (request.nextUrl.searchParams.get("summaryOnly") === "1") {
    return NextResponse.json({ summary: visibleSummary, generation: publicSummaryGeneration(generation), canManage: resolved.access.teaching });
  }
  const captionCursor = request.nextUrl.searchParams.get("captionCursor") || undefined;
  // Final captions back the authorized playback timeline and CC controls even
  // while the teacher's generated summary is still a private draft.
  const captions = await prisma.classroomCaption.findMany({
        where: { sessionId, courseId: resolved.courseId, isFinal: true },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          externalId: true,
          occurredAt: true,
          speakerName: true,
          text: true,
          translations: true,
        },
        ...(captionCursor ? { cursor: { id: captionCursor }, skip: 1 } : {}),
        take: 101,
      });
  return NextResponse.json({
    summary: visibleSummary,
    generation: publicSummaryGeneration(generation),
    canManage: resolved.access.teaching,
    captions: captions.slice(0, 100).map((caption) => ({
      id: caption.externalId,
      occurredAt: caption.occurredAt.toISOString(),
      speakerName: caption.speakerName,
      text: caption.text,
      translations: caption.translations,
    })),
    nextCaptionCursor: captions.length > 100 ? captions[99].id : null,
  });
}

export async function POST(request: NextRequest, context: Context) {
  const { sessionId } = await context.params;
  const resolved = await resolveSummaryAccess(request, sessionId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!resolved.access.teaching) {
    return NextResponse.json({ error: "Only teachers can manage lesson summaries" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    document?: unknown;
  } | null;
  try {
    let summary;
    if (body?.action === "generate" || body?.action === "ensure") {
      const generation = await queueCourseSessionSummary(resolved.courseId, sessionId,
        body.action === "ensure" ? "system" : resolved.identity.userId, body.action === "generate");
      if (summaryGenerationNeedsWorker(generation)) {
        after(() => processCourseSessionSummaryGeneration(sessionId).then(() => undefined));
      }
      summary = await prisma.courseSessionSummary.findUnique({ where: { sessionId } });
      return NextResponse.json({ summary: summary ? publicCourseSessionSummary(summary) : null, generation: publicSummaryGeneration(generation) }, {
        status: generation?.status === "queued" || generation?.status === "running" ? 202 : 200,
      });
    } else if (body?.action === "save") {
      summary = await saveCourseSessionSummary(
        resolved.courseId,
        sessionId,
        body.document,
        resolved.identity.userId,
      );
    } else if (body?.action === "publish" || body?.action === "unpublish") {
      summary = await setCourseSessionSummaryPublished(
        resolved.courseId,
        sessionId,
        body.action === "publish",
      );
    } else {
      return NextResponse.json(
        { error: "action must be ensure, generate, save, publish, or unpublish" },
        { status: 400 },
      );
    }
    return NextResponse.json({ summary: publicCourseSessionSummary(summary) });
  } catch (error) {
    console.error("[course-summary] action failed", { sessionId, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update lesson summary" },
      { status: 500 },
    );
  }
}
