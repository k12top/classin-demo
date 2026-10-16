import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { connectPlaybackMedia, recordingSourceRequest, resolvePlaybackSource, type PlaybackIssue } from "../src/lib/playback-media";

const src = "/api/sessions/lesson/recordings/attempt/play?asset=recordings%2Fclip.mp4";
const mediaUrl = "https://media.example.test/clip.mp4?signature=test-only";
const flush = () => setImmediate();

class Video extends EventTarget {
  src = "";
  paused = true;
  currentTime = 0;
  duration = 120;
  error: { code: number } | null = null;
  nativeHls = false;
  loads = 0;
  load() { this.loads++; }
  pause() { this.paused = true; }
  removeAttribute(name: string) { if (name === "src") this.src = ""; }
  canPlayType() { return this.nativeHls ? "probably" : ""; }
  asElement() { return this as unknown as HTMLVideoElement; }
  emit(name: string) { this.dispatchEvent(new Event(name)); }
}

test("only local recording endpoints resolve URLs and keep the selected asset", async () => {
  const request = recordingSourceRequest(src)!;
  const query = new URL(request, "https://classroom.test").searchParams;
  assert.equal(query.get("asset"), "recordings/clip.mp4");
  assert.equal(query.get("delivery"), "url");
  assert.ok(recordingSourceRequest("/api/courses/course/recording.mp4"));
  for (const external of [mediaUrl, "//other.test/api/courses/course/recording.mp4", "/api/other/clip.mp4"]) {
    assert.equal(recordingSourceRequest(external), null);
  }
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, request);
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.credentials, "same-origin");
    return Response.json({ url: mediaUrl, format: "mp4" });
  };
  assert.equal(await resolvePlaybackSource(src, fetcher, new AbortController().signal), mediaUrl);
  assert.equal(await resolvePlaybackSource(mediaUrl, fetcher, new AbortController().signal), mediaUrl);
  assert.equal(calls, 1);
});

test("MP4 loads the final URL and retry cleanup aborts old requests and preserves position", async () => {
  const video = new Video();
  let signal: AbortSignal | null = null;
  let direct: string | null = null;
  const cleanup = connectPlaybackMedia(video.asElement(), src, false, {
    onIssue: () => {}, onDirectUrl: (value) => { direct = value; }, startAt: 38,
    fetcher: async (_url, init) => {
      signal = init!.signal as AbortSignal;
      return Response.json({ url: mediaUrl, format: "mp4" });
    },
  });
  await flush();
  assert.equal(video.src, mediaUrl);
  assert.equal(direct, mediaUrl);
  video.emit("loadedmetadata");
  assert.equal(video.currentTime, 38);
  cleanup();
  assert.ok((signal as unknown as AbortSignal).aborted);
  assert.equal(video.src, "");
});

test("access failures are actionable and never attach a media source", async () => {
  for (const [status, issue] of [[401, "unauthorized"], [403, "forbidden"], [404, "unavailable"], [503, "network"]] as const) {
    const video = new Video();
    const issues: Array<PlaybackIssue | null> = [];
    const cleanup = connectPlaybackMedia(video.asElement(), src, false, {
      onIssue: (value) => issues.push(value), onDirectUrl: () => {},
      fetcher: async () => Response.json({ error: "test" }, { status }),
    });
    await flush();
    assert.equal(issues.at(-1), issue);
    assert.equal(video.src, "");
    cleanup();
  }
  await assert.rejects(resolvePlaybackSource(src, async () => Response.json({ url: "javascript:alert(1)", format: "mp4" }), new AbortController().signal));
});

test("decode failures and buffering timeouts surface, and successful playback clears them", async () => {
  const video = new Video();
  const issues: Array<PlaybackIssue | null> = [];
  const cleanup = connectPlaybackMedia(video.asElement(), mediaUrl, false, {
    onIssue: (value) => issues.push(value), onDirectUrl: () => {}, timeoutMs: 15,
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(issues.at(-1), "timeout");
  video.emit("playing");
  assert.equal(issues.at(-1), null);
  video.error = { code: 3 };
  video.emit("error");
  assert.equal(issues.at(-1), "decode");
  video.paused = false;
  video.emit("waiting");
  video.emit("pause");
  const before = issues.length;
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(issues.length, before);
  cleanup();
  video.emit("error");
  assert.equal(issues.length, before);
});

test("a late response after clip change cannot replace the new media source", async () => {
  const video = new Video();
  let finish!: (value: Response) => void;
  const direct: Array<string | null> = [];
  const cleanup = connectPlaybackMedia(video.asElement(), src, false, {
    onIssue: () => {}, onDirectUrl: (value) => direct.push(value),
    fetcher: () => new Promise((resolve) => { finish = resolve; }),
  });
  await flush();
  cleanup();
  video.src = "https://media.example.test/new.mp4";
  finish(Response.json({ url: mediaUrl, format: "mp4" }));
  await flush();
  assert.equal(video.src, "https://media.example.test/new.mp4");
  assert.deepEqual(direct, [null]);
});

test("native HLS keeps the authenticated manifest and never offers an MP4 link", async () => {
  const video = new Video();
  video.nativeHls = true;
  let direct: string | null = null;
  const cleanup = connectPlaybackMedia(video.asElement(), src, true, {
    onIssue: () => {}, onDirectUrl: (value) => { direct = value; },
    fetcher: async () => { throw new Error("native HLS must not resolve an MP4 URL"); },
    loadHls: async () => { throw new Error("native HLS must not load hls.js"); },
  });
  await flush();
  assert.equal(video.src, src);
  assert.equal(direct, null);
  cleanup();
});

test("HLS fatal errors surface and the player is destroyed on retry", async () => {
  const video = new Video();
  const issues: Array<PlaybackIssue | null> = [];
  let fatal!: (_event: string, data: { fatal: boolean; type: string }) => void;
  let destroyed = false;
  class FakeHls {
    static isSupported() { return true; }
    static Events = { ERROR: "error" };
    static ErrorTypes = { NETWORK_ERROR: "network", MEDIA_ERROR: "media" };
    on(_event: string, listener: typeof fatal) { fatal = listener; }
    loadSource(value: string) { assert.equal(value, src); }
    attachMedia(value: unknown) { assert.equal(value, video); }
    destroy() { destroyed = true; }
  }
  const cleanup = connectPlaybackMedia(video.asElement(), src, true, {
    onIssue: (value) => issues.push(value), onDirectUrl: () => {},
    loadHls: async () => ({ default: FakeHls }) as unknown as ReturnType<NonNullable<Parameters<typeof connectPlaybackMedia>[3]["loadHls"]>>,
  });
  await flush();
  fatal("error", { fatal: true, type: "network" });
  assert.equal(issues.at(-1), "network");
  cleanup();
  assert.equal(destroyed, true);
});
