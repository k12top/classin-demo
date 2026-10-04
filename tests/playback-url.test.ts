import assert from "node:assert/strict";
import {
  getPlaybackTarget,
  isHlsPlaybackUrl,
  isMp4PlaybackUrl,
  playbackPagePath,
} from "../src/lib/playback-url";

assert.equal(isMp4PlaybackUrl("https://cdn.example.com/course.mp4"), true);
assert.equal(isMp4PlaybackUrl("https://cdn.example.com/course.MP4?token=abc"), true);
assert.equal(isMp4PlaybackUrl("https://cdn.example.com/course.m3u8"), false);
assert.equal(
  isMp4PlaybackUrl("/api/courses/course-1/recording.mp4"),
  true
);
assert.equal(isMp4PlaybackUrl("not-a-url"), false);
assert.equal(isMp4PlaybackUrl(null), false);
assert.equal(isHlsPlaybackUrl("https://cdn.example.com/course.m3u8"), true);
assert.equal(isHlsPlaybackUrl("https://cdn.example.com/course.M3U8?token=abc"), true);
assert.equal(isHlsPlaybackUrl("https://cdn.example.com/course.mp4"), false);

assert.equal(
  playbackPagePath("abc 123"),
  "/courses/abc%20123/playback"
);

assert.deepEqual(
  getPlaybackTarget("course-1", "https://cdn.example.com/course.mp4?token=abc"),
  { kind: "internal", href: "/courses/course-1/playback" }
);

assert.deepEqual(
  getPlaybackTarget("course-1", "https://cdn.example.com/course.m3u8?token=abc"),
  { kind: "internal", href: "/courses/course-1/playback" }
);

assert.deepEqual(
  getPlaybackTarget("course-1", "/api/courses/course-1/recording.mp4"),
  { kind: "internal", href: "/courses/course-1/playback" }
);

assert.deepEqual(
  getPlaybackTarget("course-1", "https://example.com/record.html?room=1"),
  { kind: "external", href: "https://example.com/record.html?room=1" }
);

assert.equal(getPlaybackTarget("course-1", null), null);
