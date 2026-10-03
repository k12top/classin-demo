import { NextRequest, NextResponse } from "next/server";
import { resolveRecorderAccess } from "@/lib/classroom/server/recorder-access";
import {
  getClassroomCourseware,
  getClassroomEngagementSnapshot,
  getClassroomRuntimeSnapshot,
} from "@/lib/classroom/server/runtime";
import { databaseUnavailableResponse } from "@/lib/database-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "sin1";

// Poll content independently of join credentials. Minting a Netless token on
// every poll remounts Fastboard and repeatedly captures its loading screen.
export async function POST(request: NextRequest) {
  try {
    const recording = await resolveRecorderAccess(await request.json().catch(() => null));
    if (!recording) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const [runtimeSnapshot, engagement, courseware] = await Promise.all([
      getClassroomRuntimeSnapshot(recording.courseId, recording.sessionId, { ensure: false }),
      getClassroomEngagementSnapshot(recording.sessionId),
      getClassroomCourseware(recording.courseId, "teacher", recording.sessionId),
    ]);
    return NextResponse.json({
      runtime: runtimeSnapshot,
      engagement,
      courseware,
      recording: { enabled: true, status: recording.status, mode: recording.mode, fallbackFrom: recording.fallbackFrom },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const unavailable = databaseUnavailableResponse(error);
    if (unavailable) return unavailable;
    throw error;
  }
}
