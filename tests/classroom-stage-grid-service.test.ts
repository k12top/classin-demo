import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";
import { emptyClassroomComposition } from "../src/lib/classroom/composition";
import { classroomGraceEndAt } from "../src/lib/classroom/policy";
import type { ClassroomAction } from "../src/lib/classroom/types";

function fixture(count = 4) {
  const startTime = new Date(Date.now() - 60_000), endTime = new Date(Date.now() + 3_600_000);
  const lesson = { id: "lesson", roomType: 2, status: "live", startTime, endTime, course: { autoStudentOnStage: false } };
  const runtime = { id: "runtime", revision: 3, status: "live", graceEndsAt: classroomGraceEndAt(endTime), composition: emptyClassroomComposition(), session: { startTime, endTime }, members: [] };
  const members = Array.from({ length: count }, (_, i) => ({ userId: `member-${i}`, role: i ? "student" : "teacher" }));
  let selection: unknown;
  let writes = 0;
  const db = {
    courseSession: { findFirst: async () => lesson },
    classroomRuntime: {
      findUnique: async () => runtime,
      findUniqueOrThrow: async () => runtime,
      update: async ({ data }: { data: { composition?: typeof runtime.composition; revision?: { increment: number } } }) => {
        writes++;
        if (data.composition) runtime.composition = data.composition;
        if (data.revision) runtime.revision += data.revision.increment;
        return runtime;
      },
    },
    classroomMemberState: { upsert: async () => ({}), findMany: async (query: unknown) => { selection = query; return members; } },
    classroomRewardEvent: { groupBy: async () => [] },
    classroomConnection: { findMany: async () => [] },
    $queryRaw: async () => [],
  };
  const prisma = { ...db, $transaction: async <T>(fn: (tx: typeof db) => Promise<T>) => fn(db) };
  const api = loadModule<typeof import("../src/lib/classroom/server/runtime")>("src/lib/classroom/server/runtime.ts", {
    "server-only": {}, "@/lib/db": { prisma },
    "./command-receipt": { readClassroomCommand: async () => null, saveClassroomCommand: async () => {} },
    "@/lib/courseware-conversion": {}, "./integration-events": {}, "@/lib/course-session-status": {},
    "./shared-cache": {}, "./caption-demand": {},
    "./redis-presence": { readRedisClassroomPresence: async () => null, overlayRedisClassroomPresence: (value: unknown) => value },
    "./redis-sync": { refreshClassroomRedisControl: async () => {} },
  });
  const apply = (action: ClassroomAction, role: "teacher" | "student" = "teacher", expectedRevision = runtime.revision) => api.applyClassroomAction({ courseId: "course", sessionId: "lesson", session: { userId: "teacher", displayName: "Teacher", name: "Teacher", avatar: "" }, role, action, expectedRevision });
  return { apply, runtime, api, get selection() { return selection; }, get writes() { return writes; } };
}

test("actual layout service persists a 16-person grid and restores only camera windows", async () => {
  const f = fixture(16);
  const grid = await f.apply({ type: "arrangeVideoGallery", layout: "grid" });
  assert.equal(grid.composition.boardItems.length, 16);
  assert.equal(grid.composition.updatedBy, "teacher");
  assert.equal(grid.revision, 4);
  assert.deepEqual((f.selection as { where: { AND: unknown[] } }).where.AND[1], { OR: [{ role: { not: "student" } }, { onStage: true }] });
  const rail = await f.apply({ type: "arrangeVideoGallery", layout: "rail" });
  assert.equal(rail.composition.boardItems.length, 0);
  assert.equal(rail.revision, 5);
  assert.equal(f.writes, 4);
});

test("actual layout service rejects students, stale writes, invalid layout and overcapacity", async () => {
  for (const layout of ["grid", "rail"] as const) {
    const f = fixture();
    await assert.rejects(f.apply({ type: "arrangeVideoGallery", layout }, "student"), { status: 403 });
    await assert.rejects(f.apply({ type: "arrangeVideoGallery", layout }, "teacher", 1), f.api.ClassroomRevisionConflictError);
    assert.equal(f.writes, 0);
  }
  const f = fixture(25);
  await assert.rejects(f.apply({ type: "arrangeVideoGallery", layout: "grid" }), { status: 409 });
  await assert.rejects(f.apply({ type: "arrangeVideoGallery", layout: "invalid" } as unknown as ClassroomAction), { status: 400 });
  assert.equal(f.writes, 0);
  assert.equal((await f.apply({ type: "arrangeVideoGallery", layout: "rail" })).composition.boardItems.length, 0, "returning to whiteboard works even above grid capacity");
});
