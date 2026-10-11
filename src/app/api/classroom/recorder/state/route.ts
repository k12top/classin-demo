import { NextRequest, NextResponse } from "next/server";
import { resolveRecorderAccess } from "@/lib/classroom/server/recorder-access";
import {
  getClassroomCourseware,
  getClassroomEngagementSnapshot,
  getClassroomRuntimeSnapshot,
} from "@/lib/classroom/server/runtime";
import { classroomSharedRead } from "@/lib/classroom/server/shared-cache";
import { databaseUnavailableResponse } from "@/lib/database-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "sin1";

// Poll content independently of join credentials. Minting a Netless token on
// every poll remounts Fastboard and repeatedly captures its loading screen.
export async function POST(request: NextRequest) {
  const startedAt = performance.now();
  try {
    const recording = await resolveRecorderAccess(await request.json().catch(() => null));
    if (!recording) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const runtimeSnapshot = await getClassroomRuntimeSnapshot(recording.courseId, recording.sessionId, { ensure: false, coalesce: true });
    const engagement = await classroomSharedRead(recording.sessionId, "engagement", () => getClassroomEngagementSnapshot(recording.sessionId));
    const courseware = await classroomSharedRead(recording.sessionId, "courseware:teacher", () => getClassroomCourseware(recording.courseId, "teacher", recording.sessionId));
    return NextResponse.json({
      runtime: runtimeSnapshot,
      engagement,
      courseware,
      recording: { enabled: true, status: recording.status, mode: recording.mode, fallbackFrom: recording.fallbackFrom },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const unavailable = databaseUnavailableResponse(error, { route: "classroom/recorder/state", operation: "poll", durationMs: Math.round(performance.now() - startedAt) });
    if (unavailable) return unavailable;
    throw error;
  }
}
