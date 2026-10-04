import type { NextRequest } from "next/server";
import { GET as legacyGet } from "@/app/api/courses/[id]/classroom/state/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "sin1";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  return legacyGet(request, { params: Promise.resolve({ id: sessionId }) });
}
