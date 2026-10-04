import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLessonPlaybackPath, joinLessonHasEnded } from "../src/lib/join-link-routing";
import { parsePublicJoinLink, PublicApiError } from "../src/lib/public-api/input";

test("live links move to replay for actual end and elapsed grace, while cancelled lessons remain denied", () => {
  const now = new Date("2026-11-03T03:00:00Z");
  const lesson = { status: "live", endedAt: null, endTime: new Date("2026-11-03T04:00:00Z") };
  assert.equal(joinLessonHasEnded(lesson, "live", now), false);
  assert.equal(joinLessonHasEnded(lesson, "ended", now), true);
  assert.equal(joinLessonHasEnded({ ...lesson, endedAt: now }, "live", now), true);
  for (const status of ["finished", "afterClass"]) assert.equal(joinLessonHasEnded({ ...lesson, status }, undefined, now), true);
  assert.equal(joinLessonHasEnded({ ...lesson, endTime: new Date("2026-11-03T01:00:00Z") }, "waiting", now), true);
  assert.equal(joinLessonHasEnded({ ...lesson, status: "cancelled", endedAt: now }, "ended", now), false);
});

test("replay destination preserves the exact lesson and embedding parameters", () => {
  const path = buildLessonPlaybackPath("course/1", "lesson/2", { embed: true, lang: "zh-CN", parentOrigin: "https://rc.example" });
  const url = new URL(path, "https://classroom.example");
  assert.equal(url.pathname, "/courses/course%2F1/playback");
  assert.equal(url.searchParams.get("sessionId"), "lesson/2");
  assert.equal(url.searchParams.get("embed"), "1");
  assert.equal(url.searchParams.get("parentOrigin"), "https://rc.example");
});

test("anonymous link creation validates concrete parent origin, passcodes and expiry", () => {
  assert.deepEqual(parsePublicJoinLink({ parentOrigin: "https://rc.example/", passcode: "123456" }), { parentOrigin: "https://rc.example", passcode: "123456" });
  assert.deepEqual(parsePublicJoinLink({}), {});
  for (const input of [{ parentOrigin: "*" }, { parentOrigin: "https://rc.example/path" }, { parentOrigin: "https://user:pass@rc.example" }, { requirePasscode: "true" }, { passcode: "abc123" }, { passcode: "123456", requirePasscode: false }, { token: "forged" }, { expiresAt: "2020-01-01T00:00:00Z" }]) {
    assert.throws(() => parsePublicJoinLink(input), (error) => error instanceof PublicApiError && error.status === 400);
  }
});
