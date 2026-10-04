import { createPublicJoinLink } from "@/lib/public-api/courses";
import { parsePublicJoinLink, publicIdempotencyKey, readPublicJson, PublicApiError } from "@/lib/public-api/input";
import { publicOptions, publicResponse, publicRoute } from "@/lib/public-api/route";
import { normalizeParentOrigin } from "@/lib/classroom/integration-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ courseId: string; sessionId: string }> };

export function OPTIONS() { return publicOptions(); }
export function POST(request: Request, context: Context) {
  return publicRoute(async () => {
    const { courseId, sessionId } = await context.params;
    const input = parsePublicJoinLink(await readPublicJson(request));
    const origin = normalizeParentOrigin(process.env.CLASSROOM_PUBLIC_BASE_URL || new URL(request.url).origin);
    if (!origin) throw new PublicApiError(500, "internal_error", "Classroom public base URL is invalid");
    const result = await createPublicJoinLink(courseId, sessionId, input, origin, publicIdempotencyKey(request.headers));
    return publicResponse(result.body, result.replayed ? 200 : 201, { "Idempotency-Replayed": String(result.replayed) });
  });
}
