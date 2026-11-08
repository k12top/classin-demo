import { after, NextRequest, NextResponse } from "next/server";
import { publishActivityInvalidation } from "@/lib/classroom/signaling/server-publisher";
import { activityActor, activityFailure, activityBody } from "@/lib/classroom/server/activity-route";
import { activityOverview, createActivity, listActivities } from "@/lib/classroom/server/activities";
import { prisma } from "@/lib/db";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const actor = await activityActor(request, sessionId, request.nextUrl.searchParams.get("shareAccess") || undefined, "activities");
  if (actor instanceof NextResponse) return actor;
  try {
    if (request.nextUrl.searchParams.get("overview") === "1") return NextResponse.json(await activityOverview(actor), { headers: { "Cache-Control": "private, no-store" } });
    if (request.nextUrl.searchParams.get("versionOnly") === "1") {
      const runtime = await prisma.classroomRuntime.findUnique({ where: { sessionId: actor.sessionId }, select: { activityRevision: true } });
      return NextResponse.json({ revision: runtime?.activityRevision ?? 0 }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json(await listActivities(actor, request.nextUrl.searchParams.get("cursor")), { headers: { "Cache-Control": "private, no-store" } });
  }
  catch (error) { return activityFailure(error); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  let body: Record<string, unknown>;
  try { body = await activityBody(request); }
  catch (error) { return activityFailure(error); }
  const actor = await activityActor(request, sessionId, typeof body.shareAccess === "string" ? body.shareAccess : undefined, "activities");
  if (actor instanceof NextResponse) return actor;
  try {
    const result = await createActivity(actor, body.activity, typeof body.requestId === "string" ? body.requestId : "", body.start === true);
    after(() => publishActivityInvalidation(actor.sessionId, result.revision).catch(() => undefined));
    return NextResponse.json(result, { status: 201 });
  }
  catch (error) { return activityFailure(error); }
}
