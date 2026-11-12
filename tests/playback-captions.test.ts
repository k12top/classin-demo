import assert from "node:assert/strict";
import test from "node:test";
import { activeCaptionIndex, captionDataForSession, captionPosition, captionSeekPosition } from "../src/lib/classroom/playback-captions";

test("switching lessons hides the previous transcript and its pagination cursor", () => {
  const loaded = {sessionId:"lesson-a",items:[{id:"private-a"}],cursor:"cursor-a"};
  assert.equal(captionDataForSession(loaded,"lesson-b"),null);
  assert.equal(captionDataForSession(loaded,""),null);
  assert.equal(captionDataForSession(loaded,"lesson-a"),loaded);
  const next = {sessionId:"lesson-b",items:[{id:"private-b"}],cursor:null};
  assert.deepEqual(captionDataForSession(next,"lesson-b")?.items,[{id:"private-b"}]);
  assert.equal(captionDataForSession(next,"lesson-a"),null);
});

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

test("overlapping recordings prefer the segment currently being played",()=>{
 const overlap=[recordings[0],{id:"overlap",startedAt:"2026-09-27T10:02:00.000Z",stoppedAt:"2026-09-27T10:07:00.000Z"}];
 assert.deepEqual(captionPosition("2026-09-27T10:03:00Z",overlap,"overlap"),{recordingId:"overlap",seconds:60});
 assert.deepEqual(captionPosition("2026-09-27T10:03:00Z",overlap,"first"),{recordingId:"first",seconds:180});
 assert.deepEqual(captionPosition("2026-09-27T10:06:00Z",overlap,"first"),{recordingId:"overlap",seconds:240});
 assert.deepEqual(captionPosition("2026-09-27T10:05:00Z",overlap,"overlap"),{recordingId:"overlap",seconds:180});
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

test("utterance seeking includes three seconds of context within its recording", () => {
  for (const [timestamp, expected] of [
    ["2026-09-27T10:00:42.000Z", { recordingId: "first", seconds: 39 }],
    ["2026-09-27T10:10:01.500Z", { recordingId: "second", seconds: 0 }],
    ["2026-09-27T10:10:00.000Z", { recordingId: "second", seconds: 0 }],
  ] as const) {
    const position = captionPosition(timestamp, recordings)!;
    const original = { ...position };
    assert.deepEqual(captionSeekPosition(position), expected);
    assert.deepEqual(position, original, "display timestamps and synchronization retain the actual time");
  }
});

test("a cue at a shared clip boundary selects the next clip rather than the old final frame",()=>{
 const consecutive=[recordings[0],{id:"next",startedAt:recordings[0].stoppedAt,stoppedAt:"2026-09-27T10:10:00Z"}];
 assert.deepEqual(captionPosition(recordings[0].stoppedAt,consecutive,"first"),{recordingId:"next",seconds:0});
 assert.deepEqual(captionPosition("2026-09-27T10:10:00Z",consecutive),{recordingId:"next",seconds:300},"the final endpoint remains seekable");
});

test("a recorder tail cannot highlight captions after the selected clip's logical end",()=>{
 const captions=[{occurredAt:"2026-09-27T10:01:00Z"},{occurredAt:"2026-09-27T10:11:30Z"}];
 assert.equal(activeCaptionIndex(captions,recordings[0],1000),0);
});
