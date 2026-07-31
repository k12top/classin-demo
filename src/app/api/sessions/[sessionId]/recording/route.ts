import type { NextRequest } from "next/server";
import {
  GET as legacyGet,
  POST as legacyPost,
} from "@/app/api/courses/[id]/recording/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ sessionId: string }> };
async function legacyContext(context: Context) {
  const { sessionId } = await context.params;
  return { params: Promise.resolve({ id: sessionId }) };
}

export async function GET(request: NextRequest, context: Context) {
  return legacyGet(request, await legacyContext(context));
}
export async function POST(request: NextRequest, context: Context) {
  return legacyPost(request, await legacyContext(context));
}
