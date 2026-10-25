import { NextRequest, NextResponse } from "next/server";
import { activityActor, activityFailure, activityBody } from "@/lib/classroom/server/activity-route";
import { activityDetail, commandActivity, exportActivity } from "@/lib/classroom/server/activities";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ sessionId: string; activityId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const { sessionId, activityId } = await params;
  const actor = await activityActor(request, sessionId, request.nextUrl.searchParams.get("shareAccess") || undefined);
  if (actor instanceof NextResponse) return actor;
  try {
    if (request.nextUrl.searchParams.get("export") === "csv") return new NextResponse(await exportActivity(actor, activityId), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="activity-results.csv"', "Cache-Control": "private, no-store" } });
    return NextResponse.json(await activityDetail(actor, activityId, request.nextUrl.searchParams.get("cursor")), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return activityFailure(error); }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  const { sessionId, activityId } = await params;
  let body: Record<string, unknown>;
  try { body = await activityBody(request); }
  catch (error) { return activityFailure(error); }
  const actor = await activityActor(request, sessionId, typeof body.shareAccess === "string" ? body.shareAccess : undefined);
  if (actor instanceof NextResponse) return actor;
  try { return NextResponse.json(await commandActivity(actor, activityId, body)); }
  catch (error) { return activityFailure(error); }
}
