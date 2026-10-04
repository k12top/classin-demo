import { NextRequest, NextResponse } from "next/server";
import { deliverClassroomEvents } from "@/lib/classroom/server/integration-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get("authorization") !== `Bearer ${secret}` && request.headers.get("x-cron-secret") !== secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...await deliverClassroomEvents() });
}
