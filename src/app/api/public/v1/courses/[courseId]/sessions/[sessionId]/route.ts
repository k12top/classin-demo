import { deletePublicSession, getPublicSession, updatePublicSession } from "@/lib/public-api/courses";
import { parsePublicSession, readPublicJson } from "@/lib/public-api/input";
import { publicOptions, publicResponse, publicRoute, schedulePublicDeletionCleanup } from "@/lib/public-api/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ courseId: string; sessionId: string }> };
export const OPTIONS = publicOptions;

export async function GET(_request: Request, context: Context) {
  return publicRoute(async () => {
    const { courseId, sessionId } = await context.params;
    return publicResponse(await getPublicSession(courseId, sessionId));
  });
}

export async function PATCH(request: Request, context: Context) {
  return publicRoute(async () => {
    const { courseId, sessionId } = await context.params;
    return publicResponse(await updatePublicSession(courseId, sessionId, parsePublicSession(await readPublicJson(request), false)));
  });
}

export async function DELETE(_request: Request, context: Context) {
  return publicRoute(async () => {
    const { courseId, sessionId } = await context.params;
    const result = await deletePublicSession(courseId, sessionId);
    schedulePublicDeletionCleanup(courseId, result.cleanup);
    return publicResponse(result.body);
  });
}
