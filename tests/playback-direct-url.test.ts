import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { loadModule } from "./helpers/load-module";
import * as playback from "../src/lib/classroom/recording-playback";

const routes = [
  "src/app/api/sessions/[sessionId]/recordings/[recordingId]/play/route.ts",
  "src/app/api/courses/[id]/recording.mp4/route.ts",
];
const objectKey = "recordings/lesson/attempt/clip.mp4";
const signedUrl = "https://media.example.test/clip.mp4?signature=test-only";

for (const route of routes) {
  test(`${route}: URL resolution preserves access checks and private response caching`, async () => {
    let identity: object | null = { userId: "student" };
    let allowed = true;
    let signatures = 0;
    const api = loadModule<{ GET(request: NextRequest, context: unknown): Promise<Response> }>(route, {
      "@/lib/session": { getSessionFromRequest: async () => identity },
      "@/lib/courseware-access": {
        resolveCoursewareAccess: async () => ({ allowed }), canAccessCourseware: async () => allowed,
      },
      "@/lib/db": { prisma: { classroomRecording: { findFirst: async () => ({
        courseId: "course", status: "completed", stopRequestedAt: null, playbackObjectKey: objectKey, playbackFormat: "mp4", files: [], providerState: {},
      }) } } },
      "@/lib/classroom/recording-playback": playback,
      "@/lib/aliyun-oss": { getCoursewareOssClient: () => ({ signatureUrl: (key: string, options: { expires: number; response: Record<string, string> }) => {
        assert.equal(key, objectKey);
        assert.equal(options.expires, 3600);
        assert.deepEqual(options.response, { "content-disposition": "inline" });
        signatures++;
        return signedUrl;
      } }) },
    });
    const context = { params: Promise.resolve({ sessionId: "lesson", recordingId: "attempt", id: "course" }) };
    const request = () => new NextRequest(`https://classroom.test/play?delivery=url&asset=${encodeURIComponent(objectKey)}`);
    const response = await api.GET(request(), context);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { url: signedUrl, format: "mp4" });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(signatures, 1);

    allowed = false;
    assert.equal((await api.GET(request(), context)).status, 403);
    identity = null;
    assert.equal((await api.GET(request(), context)).status, 401);
    assert.equal(signatures, 1);

    identity = { userId: "student" };
    allowed = true;
    const redirect = await api.GET(new NextRequest("https://classroom.test/play"), context);
    assert.equal(redirect.status, 307);
    assert.equal(redirect.headers.get("location"), signedUrl);
    assert.equal(redirect.headers.get("cache-control"), "private, no-store");
  });
}

test("URL resolution cannot select another recording's MP4 or mistake HLS for MP4", async () => {
  let format = "mp4";
  let signed = false;
  const api = loadModule<{ GET(request: NextRequest, context: unknown): Promise<Response> }>(routes[0], {
    "@/lib/session": { getSessionFromRequest: async () => ({ userId: "student" }) },
    "@/lib/courseware-access": { resolveCoursewareAccess: async () => ({ allowed: true }) },
    "@/lib/db": { prisma: { classroomRecording: { findFirst: async () => ({
      courseId: "course", status: "completed", stopRequestedAt: null, playbackObjectKey: format === "mp4" ? objectKey : "recordings/lesson/attempt/index.m3u8",
      playbackFormat: format, files: [], providerState: {},
    }) } } },
    "@/lib/classroom/recording-playback": playback,
    "@/lib/aliyun-oss": { getCoursewareOssClient: () => ({ signatureUrl: () => { signed = true; return signedUrl; } }) },
  });
  const context = { params: Promise.resolve({ sessionId: "lesson", recordingId: "attempt" }) };
  assert.equal((await api.GET(new NextRequest("https://classroom.test/play?delivery=url&asset=another/recording.mp4"), context)).status, 400);
  format = "hls";
  assert.equal((await api.GET(new NextRequest("https://classroom.test/play?delivery=url"), context)).status, 400);
  assert.equal(signed, false);
});
