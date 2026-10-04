import "server-only";

import type { NextRequest } from "next/server";
import { resolveCourseSessionAccess } from "@/lib/course-session-access";
import { getSessionFromRequest } from "@/lib/session";

export async function resolveClassroomRequestAccess(
  request: NextRequest,
  courseId: string,
  shareAccess?: string | null,
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return {
      ok: false as const,
      status: 401,
      error: "Unauthorized",
      code: "unauthorized",
    };
  }
  const access = await resolveCourseSessionAccess(courseId, session.userId, {
    shareAccessToken: shareAccess || undefined,
    userIdAliases: [session.name],
  });
  if (!access.ok) {
    return {
      ok: false as const,
      status: access.httpStatus,
      error: access.reason,
      code: access.code,
    };
  }
  return { ok: true as const, session, access };
}
