import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { verifyRecorderToken } from "@/lib/classroom/server/recorder-token";
import { parseClassroomDiagnostic } from "@/lib/classroom/connection-diagnostics";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

/** Keep diagnostics available when the classroom database is unavailable. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new NextResponse(null, { status: 403 });
  const raw = await request.text();
  if (raw.length > 4_096) return new NextResponse(null, { status: 413 });
  const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  const fields = parseClassroomDiagnostic(body);
  if (!fields) return new NextResponse(null, { status: 400 });
  const session = await getSessionFromRequest(request);
  const recorder = !session && typeof body.recorderToken === "string" &&
    await verifyRecorderToken(body.recorderToken, String(fields.sessionId));
  if (!session && !recorder) return new NextResponse(null, { status: 401 });
  console.info("[classroom:connection]", { ...fields, userId: session?.userId ?? "recorder" });
  return new NextResponse(null, { status: 204 });
}
