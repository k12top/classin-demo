import assert from "node:assert/strict";
import test from "node:test";
import { captionWithinLesson } from "../src/lib/classroom/caption-admission";

test("offline speech can be delivered long after class without admitting post-class speech", () => {
  const lesson = { createdAt: new Date("2026-10-01T00:00:00Z"), endedAt: new Date("2026-10-27T13:00:00Z") };
  const now = Date.parse("2026-10-28T12:00:00Z");
  assert.equal(captionWithinLesson("2026-10-27T12:59:59Z", lesson, now), true);
  assert.equal(captionWithinLesson("2026-10-27T13:00:20Z", lesson, now), true);
  assert.equal(captionWithinLesson("2026-10-27T13:01:00Z", lesson, now), false);
  assert.equal(captionWithinLesson("2026-09-30T12:00:00Z", lesson, now), false);
  assert.equal(captionWithinLesson("invalid", lesson, now), false);
  assert.equal(captionWithinLesson("2026-10-29T12:00:00Z", {}, now), false);
});
