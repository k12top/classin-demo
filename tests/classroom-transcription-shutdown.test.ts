import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";

function fixture() {
  const row = { id: "runtime", sessionId: "lesson", status: "ended", startedAt: new Date(1000), transcriptionAgentId: "old-agent" as string | null,
    interpretationProvider: "wordly", transcriptionStatus: "stopping", transcriptionSyncLeaseUntil: null as Date | null };
  let stops = 0, wordlyStops = 0;
  let stop: () => Promise<void> = async () => {};
  const table = {
    findUnique: async () => ({ ...row }),
    update: async ({ data }: { data: Partial<typeof row> }) => Object.assign(row, data),
    updateMany: async ({ where, data }: { where: { OR?: unknown[]; transcriptionSyncLeaseUntil?: Date; startedAt?: Date; transcriptionAgentId?: string | null }; data: Partial<typeof row> }) => {
      if (where.OR && row.transcriptionSyncLeaseUntil && row.transcriptionSyncLeaseUntil > new Date()) return { count: 0 };
      if (where.transcriptionSyncLeaseUntil && row.transcriptionSyncLeaseUntil?.getTime() !== where.transcriptionSyncLeaseUntil.getTime()) return { count: 0 };
      if (where.startedAt && row.startedAt.getTime() !== where.startedAt.getTime()) return { count: 0 };
      if ("transcriptionAgentId" in where && row.transcriptionAgentId !== where.transcriptionAgentId) return { count: 0 };
      Object.assign(row, data); return { count: 1 };
    },
  };
  const api = loadModule<typeof import("../src/lib/classroom/server/transcription-orchestrator")>("src/lib/classroom/server/transcription-orchestrator.ts", {
    "server-only": {}, "@/lib/db": { prisma: { classroomRuntime: table } }, "@/lib/course-room": {}, "@/lib/classroom/languages": {},
    "@/lib/classroom/transcription/agora-stt": { stopAgoraTranscription: async () => { stops++; await stop(); } },
    "@/lib/classroom/translation/wordly": { stopWordlyRoom: async () => { wordlyStops++; } },
    "@/lib/classroom/server/runtime": {}, "./caption-demand": {}, "./caption-routing": {},
  });
  return { row, api, setStop: (next: () => Promise<void>) => { stop = next; }, calls: () => ({ stops, wordlyStops }) };
}

test("delayed end cleanup cannot stop captions in a reopened or newer class cycle", async () => {
  const f = fixture();
  Object.assign(f.row, { status: "live", startedAt: new Date(3000), transcriptionAgentId: "new-agent", transcriptionStatus: "running" });
  await f.api.stopClassroomTranscription("course", "lesson", { endedBefore: new Date(2000) });
  assert.deepEqual(f.calls(), { stops: 0, wordlyStops: 0 });
  assert.equal(f.row.transcriptionAgentId, "new-agent");
  assert.equal(f.row.transcriptionStatus, "running");
  f.row.status = "ended";
  await f.api.stopClassroomTranscription("course", "lesson", { endedBefore: new Date(2000) });
  assert.deepEqual(f.calls(), { stops: 0, wordlyStops: 0 });
});

test("concurrent shutdowns share one provider lease and release it after cleanup", async () => {
  const f = fixture();
  let release!: () => void;
  f.setStop(() => new Promise(resolve => { release = resolve; }));
  const first = f.api.stopClassroomTranscription("course", "lesson", { endedBefore: new Date(2000) });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.row.transcriptionSyncLeaseUntil && f.row.transcriptionSyncLeaseUntil > new Date());
  await f.api.stopClassroomTranscription("course", "lesson", { endedBefore: new Date(2000) });
  assert.deepEqual(f.calls(), { stops: 1, wordlyStops: 1 });
  release(); await first;
  assert.equal(f.row.transcriptionAgentId, null);
  assert.equal(f.row.transcriptionStatus, "stopped");
  assert.equal(f.row.transcriptionSyncLeaseUntil, null);
});

test("shutdown inside caption synchronization preserves its caller's lease", async () => {
  const f = fixture();
  const lease = new Date(Date.now() + 60_000); f.row.transcriptionSyncLeaseUntil = lease;
  await f.api.stopClassroomTranscription("course", "lesson", { claimed: true });
  assert.equal(f.row.transcriptionStatus, "stopped");
  assert.equal(f.row.transcriptionSyncLeaseUntil, lease);
});

test("a shutdown completion cannot clear a newer class or another lease owner", async () => {
  const f = fixture();
  let release!: () => void;
  f.setStop(() => new Promise(resolve => { release = resolve; }));
  const work = f.api.stopClassroomTranscription("course", "lesson");
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const nextLease = new Date(Date.now() + 240_000);
  Object.assign(f.row, { status: "live", startedAt: new Date(3000), transcriptionAgentId: "new-agent", transcriptionStatus: "running", transcriptionSyncLeaseUntil: nextLease });
  release(); await work;
  assert.equal(f.row.transcriptionAgentId, "new-agent");
  assert.equal(f.row.transcriptionStatus, "running");
  assert.equal(f.row.transcriptionSyncLeaseUntil, nextLease);
});
