import { after, NextRequest, NextResponse } from "next/server";
import { reviewActivityAnswer } from "@/lib/classroom/server/activity-ai-review";
import { activityActor, activityFailure, activityBody } from "@/lib/classroom/server/activity-route";
import { activityDetail, commandActivity, exportActivity } from "@/lib/classroom/server/activities";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ sessionId: string; activityId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  const { sessionId, activityId } = await params;
  const actor = await activityActor(request, sessionId, request.nextUrl.searchParams.get("shareAccess") || undefined, "activities");
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
  const actor = await activityActor(request, sessionId, typeof body.shareAccess === "string" ? body.shareAccess : undefined, "activities");
  if (actor instanceof NextResponse) return actor;
  try {
    if (body.action === "ai-review") {
      if (actor.role !== "teacher" && actor.role !== "assistant") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (typeof body.responseId !== "string") return NextResponse.json({ error: "Invalid response" }, { status: 400 });
      await reviewActivityAnswer(actor, activityId, body.responseId, true);
      return NextResponse.json({ revision: 0 });
    }
    const result = await commandActivity(actor, activityId, body);
    if (body.action === "answer" && "responseId" in result && typeof result.responseId === "string") {
      const id = result.responseId;
      after(() => reviewActivityAnswer(actor, activityId, id).catch(error => console.error("[activities:review]", error instanceof Error ? error.name : "failed")));
    }
    return NextResponse.json(result);
  }
  catch (error) { return activityFailure(error); }
}
