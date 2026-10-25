import { NextRequest, NextResponse } from "next/server";
import { activityActor, activityFailure } from "@/lib/classroom/server/activity-route";
import { resolveRecorderAccess } from "@/lib/classroom/server/recorder-access";
import { activityPresentation } from "@/lib/classroom/server/activities";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  try {
    const token = request.headers.get("X-Classroom-Recorder");
    let resolvedId = sessionId;
    if (token) {
      const access = await resolveRecorderAccess({ sessionId, recordingId: request.headers.get("X-Classroom-Recording"), recorderToken: token });
      if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      resolvedId = access.sessionId;
    } else {
      const actor = await activityActor(request, sessionId, request.nextUrl.searchParams.get("shareAccess") || undefined);
      if (actor instanceof NextResponse) return actor;
      resolvedId = actor.sessionId;
    }
    return NextResponse.json({ presentation: await activityPresentation(resolvedId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return activityFailure(error); }
}
