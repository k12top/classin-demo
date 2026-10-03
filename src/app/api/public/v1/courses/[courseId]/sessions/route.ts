import { createPublicSession, listPublicSessions } from "@/lib/public-api/courses";
import { parsePublicSession, publicIdempotencyKey, publicPage, readPublicJson } from "@/lib/public-api/input";
import { publicOptions, publicResponse, publicRoute } from "@/lib/public-api/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ courseId: string }> };
export const OPTIONS = publicOptions;

export async function GET(request: Request, context: Context) {
  return publicRoute(async () => publicResponse(await listPublicSessions((await context.params).courseId, publicPage(new URL(request.url).searchParams))));
}

export async function POST(request: Request, context: Context) {
  return publicRoute(async () => {
    const { courseId } = await context.params;
    const result = await createPublicSession(courseId, parsePublicSession(await readPublicJson(request), true), publicIdempotencyKey(request.headers));
    return publicResponse(result.body, result.replayed ? 200 : 201, { "Idempotency-Replayed": String(result.replayed) });
  });
}
