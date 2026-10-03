import { NextRequest, NextResponse } from "next/server";
import { resumeRecordingWhenReady } from "@/lib/classroom/server/recording-orchestrator";
import { verifyRecorderToken } from "@/lib/classroom/server/recorder-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    sessionId?: unknown;
    recordingId?: unknown;
    recorderToken?: unknown;
  };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const recordingId = typeof body.recordingId === "string" ? body.recordingId : "";
  const token = typeof body.recorderToken === "string" ? body.recorderToken : "";
  if (!sessionId || !recordingId ||
    !await verifyRecorderToken(token, sessionId, recordingId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const state = await resumeRecordingWhenReady(sessionId, recordingId);
    return NextResponse.json(
      { state },
      { status: state === "pending" ? 202 : state === "stopped" ? 409 : 200 },
    );
  } catch (error) {
    console.error("[classroom:recording] release ready recorder failed", {
      sessionId,
      recordingId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Recorder is not ready" }, { status: 503 });
  }
}
