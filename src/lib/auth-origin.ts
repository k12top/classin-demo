import "server-only";
import { normalizeParentOrigin } from "@/lib/classroom/integration-events";

/** Use the published classroom origin for OAuth behind a reverse proxy. */
export function classroomAuthOrigin(requestOrigin: string): string {
  const origin = normalizeParentOrigin(process.env.CLASSROOM_PUBLIC_BASE_URL || requestOrigin);
  if (!origin) throw new Error("Classroom public base URL is invalid");
  return origin;
}
