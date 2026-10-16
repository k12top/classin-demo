import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadModule } from "./helpers/load-module";
import * as policy from "../src/lib/classroom/recording-asset-discovery";
import * as playback from "../src/lib/classroom/recording-playback";

const prefix = "recordings/lesson/attempt/";
const base = () => ({
  id: "attempt", courseId: "course", sessionId: "lesson", status: "completed",
  playbackFormat: "hls", playbackObjectKey: `${prefix}index.m3u8`,
  files: [{ fileName: `${prefix}index.m3u8`, isPlayable: true }],
  startedAt: new Date("2026-01-01T00:00:00Z"), stoppedAt: new Date("2026-01-01T01:00:00Z"),
  lastProviderCheckAt: null as Date | null, providerState: {},
});

function service(row: ReturnType<typeof base>, list: (input: { prefix: string; marker?: string }) => Promise<unknown>) {
  const updates: Array<Record<string, unknown>> = [];
  const api = loadModule<{ discoverRecordingPlaybackAssets(id: string): Promise<boolean> }>("src/lib/classroom/server/recording-asset-discovery.ts", {
    "server-only": {},
    "@/lib/classroom/recording-asset-discovery": policy,
    "@/lib/classroom/recording-playback": playback,
    "@/lib/aliyun-oss": { getCoursewareOssClient: () => ({ list }) },
    "@/lib/db": { prisma: { classroomRecording: {
      findUnique: async () => ({ ...row }),
      updateMany: async ({ where, data }: { where: { OR?: Array<{ lastProviderCheckAt: null | { lte: Date } }> }; data: Record<string, unknown> }) => {
        if (where.OR && row.lastProviderCheckAt) {
          const cutoff = where.OR[1].lastProviderCheckAt as { lte: Date };
          if (row.lastProviderCheckAt > cutoff.lte) return { count: 0 };
        }
        updates.push(data);
        Object.assign(row, data);
        return { count: 1 };
      },
    } } },
  });
  return { ...api, updates };
}

test("completed HLS recordings discover late MP4s while preserving the playlist and caption bounds", async () => {
  const row = base();
  const stoppedAt = row.stoppedAt;
  const { discoverRecordingPlaybackAssets, updates } = service(row, async ({ prefix: actual, marker }) => {
    assert.equal(actual, prefix);
    return marker ? { objects: [{ name: `${prefix}clip_2.mp4`, size: 20 }] } : {
      nextMarker: "page2", objects: [
        { name: `${prefix}clip_10.mp4`, size: 10 },
        { name: `${prefix}partial.mp4`, size: 0 },
        { name: "recordings/other/private.mp4", size: 20 },
      ],
    };
  });
  assert.equal(await discoverRecordingPlaybackAssets(row.id), true);
  assert.equal(row.playbackFormat, "mp4");
  assert.equal(row.playbackObjectKey, `${prefix}clip_2.mp4`);
  assert.deepEqual(playback.recordingPlaybackAssets(row.files, []), [
    { objectKey: `${prefix}clip_2.mp4`, format: "mp4" },
    { objectKey: `${prefix}clip_10.mp4`, format: "mp4" },
  ]);
  assert.ok(row.files.some((file) => file.fileName.endsWith(".m3u8")));
  assert.equal(row.stoppedAt, stoppedAt);
  assert.equal(updates.length, 2);
  assert.equal(updates[1].status, undefined);
  assert.equal(updates[1].startedAt, undefined);
});

test("active recordings and existing MP4 catalogs never list potentially partial files", async () => {
  for (const status of ["recording", "processing", "stopping", "failed"]) {
    const row = { ...base(), status };
    const api = service(row, async () => { throw new Error("Must not list an active recording"); });
    assert.equal(await api.discoverRecordingPlaybackAssets(row.id), false);
    assert.equal(api.updates.length, 0);
  }
  const row = base();
  row.files.push({ fileName: `${prefix}clip.mp4`, isPlayable: true });
  assert.equal(policy.recordingAssetDiscoveryDue(row), false);
});

test("concurrent playback readers claim one storage lookup and HLS-only records stop polling", async () => {
  const row = base();
  let lists = 0;
  const api = service(row, async () => { lists++; return { objects: [] }; });
  assert.equal(policy.recordingAssetDiscoveryPollMs(row), 5_000);
  assert.deepEqual(await Promise.all([api.discoverRecordingPlaybackAssets(row.id), api.discoverRecordingPlaybackAssets(row.id)]), [false, false]);
  assert.equal(lists, 1);
  assert.equal(row.playbackFormat, "hls");
  assert.equal(policy.recordingAssetDiscoveryPollMs(row), null);
  const now = Date.now();
  row.stoppedAt = new Date(now - 10_000);
  row.lastProviderCheckAt = new Date(now);
  assert.equal(policy.recordingAssetDiscoveryPollMs(row, now), 60_000);
});

test("authorized playback reads schedule discovery without blocking the current HLS stream", async () => {
  const file = "src/app/api/sessions/[sessionId]/recordings/route.ts";
  const aliases = Object.fromEntries([...readFileSync(file, "utf8").matchAll(/from "(@\/[^"\n]+)"/g)].map((match) => [match[1], {}]));
  const after: Array<() => Promise<void>> = [];
  const discovered: string[] = [];
  let allowed = true;
  const row = base();
  const api = loadModule<{ GET(request: unknown, context: unknown): Promise<Response> }>(file, {
    ...aliases,
    "next/server": { after: (task: () => Promise<void>) => after.push(task), NextResponse: { json: Response.json } },
    "@/lib/session": { getSessionFromRequest: async () => ({ userId: "student" }) },
    "@/lib/courseware-access": { resolveCoursewareAccess: async () => ({ allowed, teaching: false }) },
    "@/lib/db": { prisma: {
      courseSession: { findUnique: async () => ({ courseId: "course" }) },
      classroomRecording: { findMany: async () => [row] },
    } },
    "@/lib/classroom/recording-playback": playback,
    "@/lib/classroom/recording-reconciliation": { recordingNeedsReconciliation: () => false },
    "@/lib/classroom/recording-asset-discovery": policy,
    "@/lib/classroom/server/recording-asset-discovery": { discoverRecordingPlaybackAssets: async (id: string) => { discovered.push(id); } },
  });
  const context = { params: Promise.resolve({ sessionId: "lesson" }) };
  const response = await api.GET({}, context);
  const payload = await response.json();
  assert.equal(payload.refreshAfterMs, 5_000);
  assert.equal(payload.recordings[0].playbackFormat, "hls");
  assert.equal(after.length, 1);
  await after[0]();
  assert.deepEqual(discovered, [row.id]);
  allowed = false;
  assert.equal((await api.GET({}, context)).status, 403);
  assert.equal(after.length, 1);
});
