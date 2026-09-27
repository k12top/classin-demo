import assert from "node:assert/strict";
import test from "node:test";
import { activeCaptionIndex, captionPosition } from "../src/lib/classroom/playback-captions";

const recordings = [
  { id: "first", startedAt: "2026-09-27T10:00:00.000Z", stoppedAt: "2026-09-27T10:05:00.000Z" },
  { id: "second", startedAt: "2026-09-27T10:10:00.000Z", stoppedAt: "2026-09-27T10:15:00.000Z" },
];

test("caption positions select the matching recording segment", () => {
  assert.deepEqual(captionPosition("2026-09-27T10:00:42.000Z", recordings), { recordingId: "first", seconds: 42 });
  assert.deepEqual(captionPosition("2026-09-27T10:11:30.000Z", recordings), { recordingId: "second", seconds: 90 });
  assert.equal(captionPosition("2026-09-27T10:07:00.000Z", recordings), null);
  assert.equal(captionPosition("not-a-date", recordings), null);
});

test("active caption follows media time within the selected segment", () => {
  const captions = [
    { occurredAt: "2026-09-27T10:00:42.000Z" },
    { occurredAt: "2026-09-27T10:02:00.000Z" },
    { occurredAt: "2026-09-27T10:11:30.000Z" },
  ];
  assert.equal(activeCaptionIndex(captions, recordings[0], 20), -1);
  assert.equal(activeCaptionIndex(captions, recordings[0], 125), 1);
  assert.equal(activeCaptionIndex(captions, recordings[1], 90), 2);
});
