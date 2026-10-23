import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadModule } from "./helpers/load-module";
import * as stopState from "../src/lib/classroom/recording-stop-state";

function fixture(role = "teacher", authenticated = true) {
  const source = "src/app/api/courses/[id]/recording/route.ts";
  const stubs = Object.fromEntries([...readFileSync(source, "utf8").matchAll(/from "(@\/[^"\n]+)"/g)].map(match => [match[1], {}]));
  const lesson = { id: "lesson", course: { id: "course" }, recordings: [{ id: "new-attempt", sessionId: "lesson", status: "recording" }] };
  const queued: string[] = [];
  const api = loadModule<typeof import("../src/app/api/courses/[id]/recording/route")>(source, {
    ...stubs,
    "next/server": { after: () => {}, NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/classroom/recording-stop-state": stopState,
    "@/lib/session": { getSessionFromRequest: async () => authenticated ? { userId: "host" } : null },
    "@/lib/course-session-access": { resolveCourseSessionAccess: async () => ({ ok: true, role, sessionId: "lesson" }) },
    "@/lib/db": { isTransientDatabaseError: () => false, prisma: {
      courseSession: { findUnique: async () => lesson },
      classroomRecording: { findFirst: async ({ where }: { where: { id: string; sessionId: string } }) => {
        assert.equal(where.sessionId, "lesson");
        return where.id === "old-attempt" ? { id: "old-attempt", sessionId: "lesson", status: "processing" } : null;
      } },
    } },
    "@/lib/classroom/server/recording-orchestrator": { requestRecordingStop: async (recording: { id: string }, rearm: boolean) => {
      assert.equal(rearm, true); queued.push(recording.id); return { ...recording, sessionId: "lesson", status: "processing" };
    } },
  });
  return { queued, post: (body: unknown) => api.POST(new Request("https://classroom.test/api/recording", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  }) as never, { params: Promise.resolve({ id: "lesson" }) }) };
}
test("rechecking an old replay only rearms its own task, never the new recorder", async () => {
  const f = fixture(); assert.equal((await f.post({ action: "stop", recordingId: "old-attempt" })).status, 202);
  assert.deepEqual(f.queued, ["old-attempt"]);
});
test("a recorder from another lesson is rejected without stopping anything", async () => {
  const f = fixture(); assert.equal((await f.post({ action: "stop", recordingId: "foreign-attempt" })).status, 404);
  assert.deepEqual(f.queued, []);
});
test("ordinary classroom stop still targets the current recorder", async () => {
  const f = fixture(); assert.equal((await f.post({ action: "stop" })).status, 202);
  assert.deepEqual(f.queued, ["new-attempt"]);
});
test("assistant can recheck, students and unauthenticated users cannot", async () => {
  assert.equal((await fixture("assistant").post({ action: "stop", recordingId: "old-attempt" })).status, 202);
  for (const f of [fixture("student"), fixture("teacher", false)]) {
    const response = await f.post({ action: "stop", recordingId: "old-attempt" });
    assert([401, 403].includes(response.status)); assert.deepEqual(f.queued, []);
  }
});
