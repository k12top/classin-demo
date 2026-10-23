import { classroomRedisEnabled, classroomRedisCommand } from "@/lib/classroom/server/redis";
import { requestClassroomRedisRefresh } from "@/lib/classroom/server/redis-sync";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import {
  getClassroomCourseware,
  getClassroomEngagementSnapshot,
  getClassroomRuntimeSnapshot,
} from "@/lib/classroom/server/runtime";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { getClassroomCaptions } from "@/lib/classroom/server/captions";
import { getClassroomQuestions } from "@/lib/classroom/server/questions";
import { getClassroomSpaces } from "@/lib/classroom/server/spaces";
import { classroomModePolicy } from "@/lib/classroom/mode";
import { getRecordingProvider } from "@/lib/classroom/server/provider-factory";
import { classroomSharedRead } from "@/lib/classroom/server/shared-cache";
import { databaseUnavailableResponse } from "@/lib/database-response";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "sin1";

async function getState(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (classroomRedisEnabled() && await classroomRedisCommand(["PING"]) !== "PONG") return NextResponse.json({ code: "presence_unavailable", retryable: true }, { status: 503, headers: { "Retry-After": "3" } });
  const { id: courseId } = await params;
  const shareAccess = request.nextUrl.searchParams.get("shareAccess");
  const resolved = await resolveClassroomRequestAccess(
    request,
    courseId,
    shareAccess,
  );
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }
  const resolvedCourseId = resolved.access.courseId;
  const sessionId = resolved.access.sessionId;

  // Channel payloads are hints only: every section still resolves viewer access.
  const scope = request.nextUrl.searchParams.get("scope");
  if (scope === "runtime" || scope === "captions" || scope === "courseware") {
    const section = scope === "runtime"
      ? { runtime: await getClassroomRuntimeSnapshot(resolvedCourseId, sessionId, { ensure: false, coalesce: true }) }
      : scope === "captions"
        ? { captions: await classroomSharedRead(sessionId, "captions:100", () => getClassroomCaptions(resolvedCourseId, 100, sessionId)) }
        : { courseware: await classroomSharedRead(sessionId, `conversion-courseware:${resolved.access.role}`, () => getClassroomCourseware(resolvedCourseId, resolved.access.role, sessionId, true)) };
    return NextResponse.json(section, { headers: { "Cache-Control": "no-store" } });
  }

  const lesson = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: {
      roomType: true,
      course: { select: { autoStudentOnStage: true } },
      recordingProvider: true,
      recordings: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          mode: true,
          fallbackFrom: true,
        },
      },
    },
  });
  const mode = classroomModePolicy(
    lesson?.roomType ?? 4,
    lesson?.course.autoStudentOnStage,
  );
  // Share room data briefly across instances; authorization and viewer-specific
  // data still load from PG, and courseware caches are isolated by role.
  const runtimeSnapshot = await getClassroomRuntimeSnapshot(resolvedCourseId, sessionId, { ensure: false, coalesce: true });
  const engagement = await classroomSharedRead(sessionId, "engagement", () => getClassroomEngagementSnapshot(sessionId));
  const [courseware, captions] = await Promise.all([
    classroomSharedRead(sessionId, `courseware:${resolved.access.role}`, () => getClassroomCourseware(resolvedCourseId, resolved.access.role, sessionId)),
    classroomSharedRead(sessionId, "captions:100", () => getClassroomCaptions(resolvedCourseId, 100, sessionId)),
  ]);
  const [spaces, questions] = await Promise.all([
    mode.allowBreakouts ? getClassroomSpaces({ courseId: resolvedCourseId, sessionId, viewerId: resolved.session.userId, role: resolved.access.role }) : Promise.resolve([]),
    mode.showPublicQuestions ? getClassroomQuestions({ courseId: resolvedCourseId, sessionId, viewerId: resolved.session.userId, role: resolved.access.role }) : Promise.resolve([]),
  ]);
  const recordingProvider = getRecordingProvider(
    lesson?.recordingProvider ?? "agora",
  );
  const latestRecording = lesson?.recordings[0];
  const recording = {
    enabled: recordingProvider.isConfigured(),
    status: latestRecording?.status ?? null,
    mode:
      latestRecording?.mode === "web"
        ? ("web" as const)
        : latestRecording?.mode === "mix"
          ? ("mix" as const)
          : null,
    fallbackFrom: latestRecording?.fallbackFrom ?? null,
  };

  return NextResponse.json(
    {
      runtime: runtimeSnapshot,
      engagement,
      courseware,
      captions,
      spaces,
      questions,
      recording,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const startedAt = performance.now();
  const { id } = await context.params;
  try {
    const response = await getState(request, context);
    response.headers.set("Server-Timing", `classroom;dur=${Math.round(performance.now() - startedAt)}`);
    return response;
  }
  catch (error) {
    if (classroomRedisEnabled()) after(() => requestClassroomRedisRefresh(id));
    const response = databaseUnavailableResponse(error, { route: "classroom/state", sessionId: id, operation: "poll", durationMs: Math.round(performance.now() - startedAt) });
    if (response) return response;
    throw error;
  }
}
