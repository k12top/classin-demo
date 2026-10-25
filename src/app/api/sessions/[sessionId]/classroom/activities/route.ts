import { NextRequest, NextResponse } from "next/server";
import { activityActor, activityFailure, activityBody } from "@/lib/classroom/server/activity-route";
import { createActivity, listActivities } from "@/lib/classroom/server/activities";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const actor = await activityActor(request, sessionId, request.nextUrl.searchParams.get("shareAccess") || undefined, "activities");
  if (actor instanceof NextResponse) return actor;
  try { return NextResponse.json(await listActivities(actor, request.nextUrl.searchParams.get("cursor")), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return activityFailure(error); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  let body: Record<string, unknown>;
  try { body = await activityBody(request); }
  catch (error) { return activityFailure(error); }
  const actor = await activityActor(request, sessionId, typeof body.shareAccess === "string" ? body.shareAccess : undefined, "activities");
  if (actor instanceof NextResponse) return actor;
  try { return NextResponse.json(await createActivity(actor, body.activity, typeof body.requestId === "string" ? body.requestId : "", body.start === true), { status: 201 }); }
  catch (error) { return activityFailure(error); }
}
