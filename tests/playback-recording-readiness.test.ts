import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { loadModule } from "./helpers/load-module";
import * as playback from "../src/lib/classroom/recording-playback";

for (const status of ["completed", "processing", "stopping", "failed", "recording"]) {
  test(`replay listing and byte access agree for ${status}, without changing task state`, async () => {
    let allowed = true, signed = 0;
    const row = { id: "attempt", courseId: "course", status, mode: "web", provider: "agora", files: [],
      startedAt: new Date(), stoppedAt: null, stopRequestedAt: status === "recording" ? null : new Date(),
      playbackObjectKey: "recordings/lesson/attempt/clip.mp4", playbackFormat: "mp4", providerState: {},
    };
    const stubs = {
      "@/lib/session": { getSessionFromRequest: async () => ({ userId: "viewer" }) },
      "@/lib/courseware-access": { resolveCoursewareAccess: async () => ({ allowed, teaching: false }) },
      "@/lib/db": { prisma: { courseSession: { findUnique: async () => ({ courseId: "course" }) },
        classroomRecording: { findMany: async () => [row], findFirst: async () => row } } },
      "@/lib/classroom/recording-playback": playback,
      "@/lib/aliyun-oss": { getCoursewareOssClient: () => ({ signatureUrl: () => { signed++; return "https://media.example.test/clip.mp4"; } }) },
    };
    const list = loadModule<typeof import("../src/app/api/sessions/[sessionId]/recordings/route")>("src/app/api/sessions/[sessionId]/recordings/route.ts", {
      ...stubs, "next/server": { after: () => {}, NextResponse: { json: Response.json } },
      "@/app/api/courses/[id]/recording/route": {}, "@/lib/classroom/server/recording-orchestrator": {},
      "@/lib/classroom/recording-reconciliation": { recordingNeedsReconciliation: () => false },
      "@/lib/classroom/recording-asset-discovery": { recordingAssetDiscoveryDue: () => false, recordingAssetDiscoveryPollMs: () => null },
      "@/lib/classroom/server/recording-asset-discovery": {}, "@/lib/classroom/recording-stop-state": { recordingStopControl: () => null },
    });
    const play = loadModule<typeof import("../src/app/api/sessions/[sessionId]/recordings/[recordingId]/play/route")>("src/app/api/sessions/[sessionId]/recordings/[recordingId]/play/route.ts", stubs);
    const context = { params: Promise.resolve({ sessionId: "lesson", recordingId: row.id }) };
    const payload = await (await list.GET(new NextRequest("https://classroom.test/recordings"), context)).json();
    const response = await play.GET(new NextRequest("https://classroom.test/play?delivery=url"), context);
    assert.equal(Boolean(payload.recordings[0].playbackUrl), status !== "recording");
    assert.equal(response.status, status === "recording" ? 404 : 200);
    assert.equal(signed, status === "recording" ? 0 : 1);
    assert.equal(row.status, status);
    assert.equal(row.stoppedAt, null);
    allowed = false;
    assert.equal((await play.GET(new NextRequest("https://classroom.test/play"), context)).status, 403);
  });
}
