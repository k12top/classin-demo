import type { NextRequest } from "next/server";
import { GET as legacyGet, PATCH as legacyPatch } from "@/app/api/courses/[id]/attendance/route";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ sessionId: string }> };
async function legacyContext(context: Context) {
  const { sessionId } = await context.params;
  return { params: Promise.resolve({ id: sessionId }) };
}

export async function GET(request: NextRequest, context: Context) {
  return legacyGet(request, await legacyContext(context));
}
export async function PATCH(request: NextRequest, context: Context) {
  return legacyPatch(request, await legacyContext(context));
}
