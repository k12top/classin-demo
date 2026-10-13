import { after, NextRequest, NextResponse } from "next/server";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { normalizeClassroomClientId } from "@/lib/classroom/server/connections";
import { CaptionPreferenceError, saveCaptionPreference } from "@/lib/classroom/server/caption-demand";
import { syncClassroomTranscription, ensureClassroomTranscriptionForLiveSession } from "@/lib/classroom/server/transcription-orchestrator";
import { synchronizeClassroomRedis } from "@/lib/classroom/server/redis-sync";
import { databaseUnavailableResponse } from "@/lib/database-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const body = await request.json().catch(() => null);
  const clientId = normalizeClassroomClientId(body?.clientId);
  if (!clientId || !(body?.language === null || typeof body?.language === "string")) {
    return NextResponse.json({ error: "字幕偏好无效", code: "invalid_caption_preference" }, { status: 400 });
  }
  const resolved = await resolveClassroomRequestAccess(request, sessionId, body.shareAccess);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error, code: resolved.code }, { status: resolved.status });
  try {
    const result = await saveCaptionPreference(resolved.access.sessionId, resolved.session.userId, clientId, body.language);
    if (result.changed) await synchronizeClassroomRedis(resolved.access.sessionId, true);
    // Also retry interrupted provider updates when the desired set is unchanged.
    after(() => (result.changed
      ? syncClassroomTranscription(resolved.access.courseId, { sessionId: resolved.access.sessionId, restart: true })
      : ensureClassroomTranscriptionForLiveSession(resolved.access.courseId, resolved.access.sessionId)).catch(error => {
      console.warn("[classroom:caption-preference] sync failed", { sessionId, error: error instanceof Error ? error.message : String(error) });
    }));
    return NextResponse.json({ language: body.language, targetLanguages: result.targetLanguages });
  } catch (error) {
    if (error instanceof CaptionPreferenceError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const unavailable = databaseUnavailableResponse(error, { route: "classroom/caption-preference", sessionId });
    if (unavailable) return unavailable;
    throw error;
  }
}
