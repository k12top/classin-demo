import { NextRequest, NextResponse } from "next/server";
import { resolveCoursewareAccess } from "@/lib/courseware-access";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import {
  generateCourseSessionSummary,
  publicCourseSessionSummary,
  saveCourseSessionSummary,
  setCourseSessionSummaryPublished,
} from "@/lib/course-session-summary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  if (!summary || (!resolved.access.teaching && summary.status !== "published")) {
    return NextResponse.json({ summary: null, canManage: resolved.access.teaching });
  }
  return NextResponse.json({
    summary: publicCourseSessionSummary(summary),
    canManage: resolved.access.teaching,
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
    if (body?.action === "generate") {
      summary = await generateCourseSessionSummary(
        resolved.courseId,
        sessionId,
        resolved.identity.userId,
      );
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
        { error: "action must be generate, save, publish, or unpublish" },
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
