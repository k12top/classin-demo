import assert from "node:assert/strict";
import test from "node:test";
import { recordingPlaybackAssets, recordingReplayAssets } from "../src/lib/classroom/recording-playback";

test("all MP4 files from one recording play in numeric order without HLS duplicates", () => {
  assert.deepEqual(recordingPlaybackAssets([
    { fileName: "clip_10.mp4", isPlayable: true },
    { fileName: "clip_2.mp4", isPlayable: true },
    { fileName: "playlist.m3u8", isPlayable: true },
    { fileName: "clip_2.mp4", isPlayable: true },
    { fileName: "../other.mp4", isPlayable: true },
    { fileName: "unready.mp4", isPlayable: false },
  ], ["recordings", "lesson", "attempt"], "recordings/lesson/attempt/playlist.m3u8", "hls"), [
    { objectKey: "recordings/lesson/attempt/clip_2.mp4", format: "mp4" },
    { objectKey: "recordings/lesson/attempt/clip_10.mp4", format: "mp4" },
  ]);
});

test("durable replay files are usable without fabricating recorder exit or exposing active tasks", () => {
  const file = { fileName: "clip.mp4" };
  const state = { files: [file], providerState: { fileNamePrefix: ["recordings", "lesson", "attempt"] }, playbackObjectKey: null, playbackFormat: null };
  for (const status of ["stopping", "processing", "failed"]) {
    assert.deepEqual(recordingReplayAssets({ ...state, status, stopRequestedAt: new Date() }), [{ objectKey: "recordings/lesson/attempt/clip.mp4", format: "mp4" }]);
    assert.deepEqual(recordingReplayAssets({ ...state, status, stopRequestedAt: null }), []);
  }
  for (const status of ["starting", "recording"]) assert.deepEqual(recordingReplayAssets({ ...state, status, stopRequestedAt: new Date() }), []);
});

test("HLS and legacy playback keys remain available when no MP4 exists", () => {
  assert.deepEqual(recordingPlaybackAssets(
    [{ fileName: "recordings/lesson/attempt/index.m3u8" }],
    ["recordings", "lesson", "attempt"],
  ), [{ objectKey: "recordings/lesson/attempt/index.m3u8", format: "hls" }]);
  assert.deepEqual(recordingPlaybackAssets(null, [], "legacy/video.mp4", "mp4"), [
    { objectKey: "legacy/video.mp4", format: "mp4" },
  ]);
});
