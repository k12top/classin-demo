import { after, NextRequest, NextResponse } from "next/server";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { leaveClassroomConnection, normalizeClassroomClientId } from "@/lib/classroom/server/connections";
import { deliverClassroomEvents } from "@/lib/classroom/server/integration-events";
export async function POST(request: NextRequest) {
 const body = await request.json().catch(() => null);
 if (typeof body?.sessionId !== "string") return NextResponse.json({ error: "sessionId required" }, { status: 400 });
 const clientId = normalizeClassroomClientId(body.clientId);
 if (!clientId) return NextResponse.json({ error: "valid clientId required" }, { status: 400 });
 const resolved = await resolveClassroomRequestAccess(request, body.sessionId, body.shareAccess);
 if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
 await leaveClassroomConnection(resolved.access.sessionId, resolved.session.userId, clientId, body.voluntary === true);
 after(() => deliverClassroomEvents());
 return NextResponse.json({ ok: true });
}
