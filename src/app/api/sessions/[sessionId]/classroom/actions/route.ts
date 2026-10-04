import type { NextRequest } from "next/server";
import { POST as legacyPost } from "@/app/api/courses/[id]/classroom/actions/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  return legacyPost(request, { params: Promise.resolve({ id: sessionId }) });
}
