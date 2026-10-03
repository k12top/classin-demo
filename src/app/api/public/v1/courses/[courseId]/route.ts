import { deletePublicCourse, getPublicCourse, updatePublicCourse } from "@/lib/public-api/courses";
import { parsePublicCourse, readPublicJson } from "@/lib/public-api/input";
import { publicOptions, publicResponse, publicRoute, schedulePublicDeletionCleanup } from "@/lib/public-api/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ courseId: string }> };
export const OPTIONS = publicOptions;

export async function GET(_request: Request, context: Context) {
  return publicRoute(async () => publicResponse(await getPublicCourse((await context.params).courseId)));
}

export async function PATCH(request: Request, context: Context) {
  return publicRoute(async () => publicResponse(await updatePublicCourse((await context.params).courseId, parsePublicCourse(await readPublicJson(request), false))));
}

export async function DELETE(_request: Request, context: Context) {
  return publicRoute(async () => {
    const { courseId } = await context.params;
    const result = await deletePublicCourse(courseId);
    schedulePublicDeletionCleanup(courseId, result.cleanup);
    return publicResponse(result.body);
  });
}
