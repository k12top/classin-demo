import { NextRequest, NextResponse } from "next/server";
import {
  getClassroomCaptions,
  ingestClassroomCaption,
} from "@/lib/classroom/server/captions";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { verifyRecorderToken } from "@/lib/classroom/server/recorder-token";
import type { ClassroomCaptionInput } from "@/lib/classroom/types";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const shareAccess = request.nextUrl.searchParams.get("shareAccess");
  const resolved = await resolveClassroomRequestAccess(request, courseId, shareAccess);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }
  return NextResponse.json(
    {
      captions: await getClassroomCaptions(
        resolved.access.courseId,
        100,
        resolved.access.sessionId,
      ),
    },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as
    | {
        caption?: Partial<ClassroomCaptionInput>;
        shareAccess?: unknown;
        recorderToken?: unknown;
      }
    | null;
  const shareAccess = typeof body?.shareAccess === "string" ? body.shareAccess : "";
  const recorderToken =
    typeof body?.recorderToken === "string" ? body.recorderToken.trim() : "";
  const recorder = recorderToken
    ? await verifyRecorderToken(recorderToken, courseId)
    : false;
  const resolved = recorder
    ? null
    : await resolveClassroomRequestAccess(request, courseId, shareAccess);
  if (resolved && !resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }
  if (resolved?.ok && resolved.access.role === "student") {
    return NextResponse.json({ error: "Only teaching roles can ingest captions" }, { status: 403 });
  }
  const recorderLesson = recorder
    ? await prisma.courseSession.findUnique({
        where: { id: courseId },
        select: { id: true, courseId: true },
      })
    : null;
  if (recorder && !recorderLesson) {
    return NextResponse.json({ error: "Course session not found" }, { status: 404 });
  }
  const resolvedCourseId = recorderLesson?.courseId || resolved!.access.courseId;
  const resolvedSessionId = recorderLesson?.id || resolved!.access.sessionId;
  const caption = body?.caption;
  if (
    !caption ||
    typeof caption.id !== "string" ||
    typeof caption.text !== "string" ||
    typeof caption.speakerId !== "string" ||
    typeof caption.isFinal !== "boolean"
  ) {
    return NextResponse.json({ error: "Invalid caption payload" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await ingestClassroomCaption(resolvedCourseId, {
        id: caption.id,
        text: caption.text,
        sourceLanguage:
          typeof caption.sourceLanguage === "string" ? caption.sourceLanguage : "",
        detectedLanguage:
          typeof caption.detectedLanguage === "string" ? caption.detectedLanguage : "",
        translations:
          caption.translations && typeof caption.translations === "object"
            ? (caption.translations as Record<string, string>)
            : {},
        speakerId: caption.speakerId,
        speakerName:
          typeof caption.speakerName === "string" ? caption.speakerName : "",
        occurredAt:
          typeof caption.occurredAt === "string"
            ? caption.occurredAt
            : new Date().toISOString(),
        isFinal: caption.isFinal,
      }, resolvedSessionId),
    );
  } catch (error) {
    console.error("[classroom:captions] ingest failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Caption ingest failed" },
      { status: 500 },
    );
  }
}
