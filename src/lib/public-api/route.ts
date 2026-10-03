import "server-only";
import { after } from "next/server";
import { isTransientDatabaseError } from "@/lib/db";
import { stopActiveRecordingsForCourse } from "@/lib/classroom/server/recording-orchestrator";
import { stopClassroomTranscription } from "@/lib/classroom/server/transcription-orchestrator";
import { deliverClassroomEvents } from "@/lib/classroom/server/integration-events";
import { PublicApiError } from "./input";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
  "Access-Control-Expose-Headers": "Idempotency-Replayed",
  "Cache-Control": "no-store",
};

export function publicResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return Response.json(body, { status, headers: { ...cors, ...headers } });
}

export function publicOptions() {
  return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Max-Age": "600" } });
}

export async function publicRoute(operation: () => Promise<Response>): Promise<Response> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof PublicApiError) return publicResponse({ error: { code: error.code, message: error.message } }, error.status);
    if (isTransientDatabaseError(error)) return publicResponse({ error: { code: "database_unavailable", message: "Database temporarily unavailable; retry later" } }, 503, { "Retry-After": "5" });
    if (error && typeof error === "object" && "code" in error && ["P2002", "P2034", "40P01"].includes(String(error.code))) return publicResponse({ error: { code: "conflict", message: "Concurrent update; retry this request" } }, 409);
    console.error("[public-api] operation failed", error instanceof Error ? error.message : "Unknown error");
    return publicResponse({ error: { code: "internal_error", message: "Request failed" } }, 500);
  }
}

export function schedulePublicDeletionCleanup(courseId: string, sessions: string[]) {
  if (!sessions.length) return;
  after(async () => {
    const results = await Promise.allSettled(sessions.map(async (sessionId) => {
      await Promise.all([
        stopActiveRecordingsForCourse(courseId, sessionId),
        stopClassroomTranscription(courseId, sessionId),
      ]);
    }));
    for (const result of results) if (result.status === "rejected") console.error("[public-api] provider cleanup deferred", result.reason instanceof Error ? result.reason.message : "Unknown error");
  });
  after(() => deliverClassroomEvents());
}
