import { createPublicCourse, listPublicCourses } from "@/lib/public-api/courses";
import { parsePublicCourse, publicIdempotencyKey, publicPage, readPublicJson } from "@/lib/public-api/input";
import { publicOptions, publicResponse, publicRoute } from "@/lib/public-api/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const OPTIONS = publicOptions;

export async function GET(request: Request) {
  return publicRoute(async () => publicResponse(await listPublicCourses(publicPage(new URL(request.url).searchParams))));
}

export async function POST(request: Request) {
  return publicRoute(async () => {
    const input = parsePublicCourse(await readPublicJson(request), true);
    const result = await createPublicCourse(input, publicIdempotencyKey(request.headers));
    return publicResponse(result.body, result.replayed ? 200 : 201, { "Idempotency-Replayed": String(result.replayed) });
  });
}
