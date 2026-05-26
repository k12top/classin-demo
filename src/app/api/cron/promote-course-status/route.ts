/**
 * Optional cron: promote afterClass -> finished when delay elapsed.
 * GET /api/cron/promote-course-status
 * Authorization: Bearer CRON_SECRET or x-cron-secret header
 */
import { NextRequest, NextResponse } from "next/server";
import { promoteCoursesIfDue } from "@/lib/course-promote";

function isAuthorized(request: NextRequest): boolean {
  // Allow unauthenticated manual trigger in local development for easier testing
  if (process.env.NODE_ENV === "development") return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  return request.headers.get("x-cron-secret") === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await promoteCoursesIfDue();
    return NextResponse.json({ ok: true, promoted: count });
  } catch (error) {
    console.error("Cron promote-course-status failed:", error);
    return NextResponse.json(
      { error: "Failed to promote courses" },
      { status: 500 }
    );
  }
}
