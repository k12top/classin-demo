import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";
import { classroomModePolicy } from "../src/lib/classroom/mode";

type Api = typeof import("../src/lib/classroom/server/runtime");
function fixture() {
  const rows = new Map<string, Record<string, unknown>>();
  let serial = Promise.resolve();
  const db = {
    courseSession: { findFirst: async () => ({ status: "scheduled", endTime: null }) },
    classroomRuntime: { findUniqueOrThrow: async () => ({stageStudentLimit:null}), findUnique: async () => ({ id: "runtime", status: "waiting", graceEndsAt: null }) },
    classroomMemberState: {
      findUnique: async ({ where }: { where: { sessionId_userId: { userId: string } } }) => rows.get(where.sessionId_userId.userId) || null,
      upsert: async ({ where, create, update }: { where: { sessionId_userId: { userId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const id = where.sessionId_userId.userId;
        const row = rows.has(id) ? { ...rows.get(id), ...update } : { id, ...create };
        rows.set(id, row); return row;
      },
    },
    $queryRaw: async (sql: TemplateStringsArray) => sql.join("").includes("COUNT(*)")
      ? [{ count: BigInt([...rows.values()].filter(row => row.role === "student" && row.onStage).length) }] : [],
    $transaction: <T>(operation: (tx: unknown) => Promise<T>) => {
      const next = serial.then(() => operation(db));
      serial = next.then(() => undefined, () => undefined); return next;
    },
  };
  const api = loadModule<Api>("src/lib/classroom/server/runtime.ts", {
    "server-only": {}, "./command-receipt": {}, "@/lib/db": { prisma: db, withDatabaseConflictRetry: <T>(operation: () => Promise<T>) => operation() },
    "@/lib/course-session-status": { syncCourseStatusFromSessions: async () => {} },
    "@/lib/courseware-conversion": {}, "./integration-events": {}, "./shared-cache": {},
    "./redis-presence": { readRedisClassroomPresence: async () => null }, "./redis-sync": {}, "./caption-demand": {},
  });
  const mode = classroomModePolicy(4);
  const join = (userId: string, joining = true, supplied = mode) => api.touchClassroomMember("course", { userId, displayName: userId, name: userId, avatar: "" }, "student", supplied, "lesson", joining);
  return { rows, join, mode };
}

test("normal voluntary re-entry is admitted but routine touches cannot undo a removal or decline", async () => {
  const { rows, join } = fixture();
  assert.equal((await join("student")).onStage, true);
  rows.set("student", { ...rows.get("student"), onStage: false, stageState: "left", microphoneAllowed: false });
  assert.equal((await join("student", false)).onStage, false, "chat and background requests cannot re-admit a departed student");
  const returned = await join("student");
  assert.equal(returned.onStage, true);
  assert.equal(returned.microphoneAllowed, false, "re-entry must preserve a teacher's microphone block");
  for (const stageState of ["removed", "declined", "invited", "offstage"]) {
    rows.set("student", { ...rows.get("student"), onStage: false, stageState });
    assert.equal((await join("student")).onStage, false, stageState);
  }
});

test("simultaneous re-entries respect capacity and waiters may enter when a seat is freed", async () => {
  const { rows, join, mode } = fixture();
  const limited = { ...mode, maxStageStudents: 1 };
  await join("first", true, limited);
  assert.equal((await join("waiting", true, limited)).onStage, false);
  rows.set("first", { ...rows.get("first"), onStage: false, stageState: "left" });
  const admitted = await join("waiting", true, limited);
  assert.equal(admitted.onStage, true);
  assert.equal(admitted.microphoneAllowed, true, "a first capacity admission receives normal stage permission");
  rows.set("waiting", { ...rows.get("waiting"), onStage: false, stageState: "left" });
  const result = await Promise.all([join("first", true, limited), join("waiting", true, limited)]);
  assert.equal(result.filter(row => row.onStage).length, 1);
  rows.set("disabled", { id: "disabled", role: "student", onStage: false, stageState: "left" });
  assert.equal((await join("disabled", true, { ...limited, defaultStudentOnStage: false })).onStage, false);
});
