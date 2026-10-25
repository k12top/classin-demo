import { NextRequest, NextResponse } from "next/server";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import type { ActivityActor } from "@/lib/classroom/server/activities";
import { ActivityError } from "@/lib/classroom/activities";
export async function activityActor(request: NextRequest, sessionId: string, shareAccess?: string, purpose?: "activities") {
  const access = await resolveClassroomRequestAccess(request, sessionId, shareAccess, { purpose });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  return { courseId: access.access.courseId, sessionId: access.access.sessionId, userId: access.session.userId,
    displayName: access.session.displayName || access.session.name || access.session.userId, role: access.access.role } satisfies ActivityActor;
}
export function activityFailure(error: unknown) {
  if (error instanceof ActivityError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("[classroom:activities]", error);
  return NextResponse.json({ error: "Activity request failed. Please retry." }, { status: 500 });
}

/** Count bytes while reading, before buffering or parsing potentially large JSON. */
export async function activityBody(request: Request): Promise<Record<string, unknown>> {
  // Covers every supported 50-question definition and answer in UTF-8.
  const limit = 10 * 1024 * 1024;
  const length = request.headers.get("content-length");
  if (length && Number(length) > limit) throw new ActivityError("Activity request is too large", 413);
  if (!request.body) throw new ActivityError("Invalid JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new ActivityError("Activity request is too large", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw new ActivityError("Invalid JSON"); }
}
