import assert from "node:assert/strict";
import test from "node:test";
import { memberScreenShareStatus } from "../src/lib/classroom/screen-share-state";
import { ScreenShareReleaseQueue } from "../src/lib/classroom/screen-share-release";

test("authorization, capture preparation and published screen video have distinct roster states", () => {
  const member = { userId: "simon", screenShareState: "accepted" };
  const lease = { userId: "simon", clientId: "tab", rtcUid: 123, claimId: "claim" };
  const video = { id: "123", kind: "screen" as const, hasVideo: true, hasAudio: false, isLocal: false, displayName: "Screen" };
  assert.equal(memberScreenShareStatus(member, undefined, []), "ready");
  assert.equal(memberScreenShareStatus(member, lease, []), "starting");
  assert.equal(memberScreenShareStatus(member, lease, [video]), "sharing");
  assert.equal(memberScreenShareStatus(member, undefined, [video]), "ready", "a stale RTC stream cannot keep a stopped share active");
  assert.equal(memberScreenShareStatus(member, { ...lease, userId: "teacher" }, [video]), "ready", "host takeover cannot highlight the previous student's button");
  assert.equal(memberScreenShareStatus(member, lease, [{ ...video, hasVideo: false }]), "starting");
  assert.equal(memberScreenShareStatus({ ...member, screenShareState: "requested" }, undefined, []), "requested");
});

test("a failed stop survives retry, coalesces concurrent stops and drains later claims in order", async () => {
  const queue = new ScreenShareReleaseQueue();
  queue.add({ type: "releaseScreenShare", claimId: "first" });
  await assert.rejects(queue.flush(async () => { throw new Error("offline"); }), /offline/);
  let complete!: () => void;
  const gate = new Promise<void>(resolve => { complete = resolve; });
  const sent: string[] = [];
  const send = async (action: { claimId: string }) => { sent.push(action.claimId); if (action.claimId === "first") await gate; };
  const first = queue.flush(send);
  assert.equal(queue.flush(send), first);
  queue.add({ type: "releaseScreenShare", claimId: "second" });
  complete();
  await first;
  assert.deepEqual(sent, ["first", "second"]);
  await queue.flush(send);
  assert.deepEqual(sent, ["first", "second"], "acknowledged stops do not run again");
});
