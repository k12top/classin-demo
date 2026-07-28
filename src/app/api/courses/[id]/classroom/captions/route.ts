import { NextRequest, NextResponse } from "next/server";
import {
  getClassroomCaptions,
  ingestClassroomCaption,
} from "@/lib/classroom/server/captions";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import type { ClassroomCaptionInput } from "@/lib/classroom/types";

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
    { captions: await getClassroomCaptions(courseId) },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as
    | { caption?: Partial<ClassroomCaptionInput>; shareAccess?: unknown }
    | null;
  const shareAccess = typeof body?.shareAccess === "string" ? body.shareAccess : "";
  const resolved = await resolveClassroomRequestAccess(request, courseId, shareAccess);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }
  if (resolved.access.role === "student") {
    return NextResponse.json({ error: "Only teaching roles can ingest captions" }, { status: 403 });
  }
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
      await ingestClassroomCaption(courseId, {
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
      }),
    );
  } catch (error) {
    console.error("[classroom:captions] ingest failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Caption ingest failed" },
      { status: 500 },
    );
  }
}
