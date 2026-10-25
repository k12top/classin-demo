/* eslint-disable @typescript-eslint/no-explicit-any -- isolated database and provider boundaries */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadModule } from "./helpers/load-module";
import * as cycle from "../src/lib/classroom/recording-cycle";
import * as continuity from "../src/lib/classroom/recording-continuity";
import * as stopState from "../src/lib/classroom/recording-stop-state";

const start = new Date("2026-10-23T10:00:00Z");
const base = { createdAt: start, status: "completed", retryCount: 0, failureStage: null, stopRequestedAt: new Date(start.getTime() + 60_000) };
test("reopening requests a new segment while a manual stop stays stopped within the same cycle", () => {
  assert.equal(cycle.automaticRecordingNeeded(base, start, 3), false);
  assert.equal(cycle.automaticRecordingNeeded(base, new Date(start.getTime() + 120_000), 3), true);
  assert.equal(cycle.automaticRecordingNeeded(null, start, 3), true);
  assert.equal(cycle.automaticRecordingNeeded({ ...base, failureStage: "start-unknown", status: "failed" }, new Date(start.getTime() + 120_000), 3), false);
  assert.equal(cycle.automaticRecordingNeeded({ ...base, providerState: { continuityReason: "duration_rollover" } }, start, 3), true);
});
test("long extended classes rotate the recorder before its configured duration expires", () => {
  const recording = { ...base, status: "recording", stopRequestedAt: null };
  assert.equal(cycle.recordingRotationDue(recording, 1, start.getTime() + 54 * 60_000), false);
  assert.equal(cycle.recordingRotationDue(recording, 1, start.getTime() + 55 * 60_000), true);
  assert.equal(cycle.recordingRotationDue({ ...recording, stopRequestedAt: new Date() }, 1, start.getTime() + 60 * 60_000), false);
});

function fixture(prior: any[] = []) {
  const rows = prior.map(row => ({ ...base, id: "old", providerState: {}, ...row }));
  const runtime = { status: "live", recordingStartMode: "classStart", startedAt: new Date(start.getTime() + 120_000) };
  const lesson = { id: "lesson", courseId: "course", status: "live", recordingProvider: "agora", roomUuid: "room" };
  const table = {
    findFirst: async () => rows.find(row => ["starting", "recording", "stopping", "processing"].includes(row.status) || row.failureStage === "start-unknown") || null,
    create: async ({ data }: any) => { const row = { ...base, ...data, id: `new-${rows.length}`, createdAt: runtime.startedAt }; rows.unshift(row); return row; },
  };
  const tx = { $queryRaw: async () => [], classroomRuntime: { findUnique: async () => runtime },
    courseSession: { findFirst: async () => ({ ...lesson, recordings: rows.slice(0, 1) }) }, classroomRecording: table };
  let tail = Promise.resolve();
  const prisma = { $transaction: (fn: any) => { const job = tail.then(() => fn(tx)); tail = job.then(() => undefined, () => undefined); return job; } };
  const source = "src/lib/classroom/server/recording-orchestrator.ts";
  const stubs = Object.fromEntries([...readFileSync(source, "utf8").matchAll(/from "(@\/[^"\n]+)"/g)].map(match => [match[1], {}]));
  const api = loadModule<typeof import("../src/lib/classroom/server/recording-orchestrator")>(source, {
    ...stubs, "server-only": {}, "@/lib/db": { prisma }, "@/lib/course-status": { CourseStatus: { AFTER_CLASS: "afterClass", FINISHED: "finished", CANCELLED: "cancelled" } },
    "@/lib/classroom/recording-cycle": cycle, "@/lib/classroom/recording-continuity": continuity,
    "@/lib/classroom/server/provider-factory": { getRecordingProvider: () => ({ name: "agora", validateConfiguration() {} }) },
    "@/lib/classroom/server/recorder-token": { isRecorderPageConfigured: () => true },
    "@/lib/course-room": { courseIdToRoomUuid: () => "room" }, "./recording-stop": {}, "../recording-stop-state": stopState,
  });
  return { rows, runtime, start: () => api.requestRecordingStart("course", "lesson") };
}
test("50 simultaneous starts append exactly one new segment and retain completed older footage", async () => {
  const f = fixture([{ status: "completed" }]);
  const attempts = await Promise.all(Array.from({ length: 50 }, () => f.start()));
  assert.equal(f.rows.length, 2);
  assert(attempts.every(row => row.id === attempts[0].id));
  assert.equal(f.rows[1].id, "old");
  assert.equal(f.rows[1].status, "completed");
});
test("new cycle waits for unresolved old recorder shutdown and respects recording-disabled settings", async () => {
  const f = fixture([{ status: "processing", stopRequestedAt: new Date() }]);
  assert.equal((await f.start()).id, "old");
  assert.equal(f.rows.length, 1);
  f.runtime.recordingStartMode = "disabled";
  await assert.rejects(f.start(), /disabled/);
});

test("scheduled end re-reads eligibility after the extension or reopen acquires the lock", async () => {
  const source = "src/lib/classroom/server/lesson-deadline.ts";
  const module = loadModule<typeof import("../src/lib/classroom/server/lesson-deadline")>(source, { "@prisma/client": { Prisma: { join: (ids: string[]) => ids.join(",") } } });
  let reads = 0, locks = 0;
  const tx = { courseSession: { findMany: async ({ where }: any) => {
    reads++;
    if (reads === 1) return [{ id: "lesson", courseId: "course", endTime: start, endedAt: null }];
    assert.equal(locks, 2); assert.deepEqual(where.id, { in: ["lesson"] });
    // The extension has committed. This row no longer meets the deadline predicate.
    return [];
  } }, $queryRaw: async () => { locks++; return []; } };
  assert.deepEqual(await module.lockDueLessons(tx as any, {}, start), []);
  assert.equal(reads, 2);
});


test("explicit start cannot hide an unknown old provider task behind a successful queued response", async () => {
  const f = fixture([{ status: "failed", failureStage: "start-unknown" }]);
  await assert.rejects(f.start(), /Verify the previous provider startup outcome/);
  assert.equal(f.rows.length, 1);
});

test("an expired runtime snapshot cannot end a lesson extended before the deadline lock", async () => {
  const source = "src/lib/classroom/server/runtime.ts";
  const stubs = Object.fromEntries([...readFileSync(source, "utf8").matchAll(/from "([^"\n]+)"/g)].map(match => [match[1], {}]));
  const expired = { id: "room", courseId: "course", sessionId: "lesson", status: "live", graceEndsAt: new Date(0) };
  const extended = { ...expired, graceEndsAt: new Date(Date.now() + 3_600_000) };
  let ended = 0, stopped = 0;
  const tx = { $queryRaw: async () => [],
    courseSession: { findUniqueOrThrow: async () => ({ endTime: extended.graceEndsAt, status: "live" }), update: async () => { ended++; } },
    classroomRuntime: { findUniqueOrThrow: async () => extended, update: async () => { ended++; } },
    classroomRecording: { updateMany: async () => { stopped++; } } };
  const api = loadModule<typeof import("../src/lib/classroom/server/runtime")>(source, {
    ...stubs, "server-only": {}, "@/lib/db": { prisma: {
      courseSession: { findFirst: async () => ({ id: "lesson", status: "live", endTime: expired.graceEndsAt }) },
      classroomRuntime: { findUnique: async () => expired }, $transaction: (fn: any) => fn(tx),
    } }, "@/lib/course-status": { CourseStatus: { FINISHED: "finished", CANCELLED: "cancelled" } },
    "@/lib/classroom/policy": { classroomGraceEndAt: (date: Date) => date },
  });
  assert.equal((await api.ensureClassroomRuntime("course", "lesson")).graceEndsAt, extended.graceEndsAt);
  assert.equal(ended, 0);
  assert.equal(stopped, 0);
});
