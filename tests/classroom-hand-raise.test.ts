import assert from "node:assert/strict";
import test from "node:test";
import { applyClassroomHandRaiseUpdate, raisedClassroomHands } from "../src/lib/classroom/hand-raise";
import { requestClassroomAction } from "../src/lib/classroom/action-request";
import { emptyClassroomComposition } from "../src/lib/classroom/composition";
import type { ClassroomMemberSnapshot, ClassroomRuntimeSnapshot } from "../src/lib/classroom/types";
import type { ClassroomHandRaiseUpdate } from "../src/lib/classroom/signaling/types";

const member = (userId: string, role: ClassroomMemberSnapshot["role"]): ClassroomMemberSnapshot => ({
  userId, role, displayName: userId, avatar: "", online: true, onStage: true, stageState: "accepted",
  screenShareState: "idle", screenShareRequestedAt: null, microphoneAllowed: false, cameraAllowed: false,
  chatMuted: false, whiteboardWritable: false, handRaisedAt: null, rewardCount: 0, signalingUserIds: [`${userId}:tab`],
});
const runtime: ClassroomRuntimeSnapshot = {
  status: "live", revision: 10, recordingStartMode: "classStart", startedAt: null, graceEndsAt: null,
  stageMode: "auto", stageLocked: false, spotlightUserId: null, activeCoursewareId: null, chatEnabled: true,
  timerStartedAt: null, timerDurationSec: null, timerPausedAt: null,
  interpretation: { enabled: false, provider: "shengwang", sourceLanguage: "zh-CN", targetLanguages: [], status: "stopped", error: null },
  composition: emptyClassroomComposition(), members: [member("teacher", "teacher"), member("alice", "student"), member("bob", "student")],
};
const raised: ClassroomHandRaiseUpdate = { courseId: "lesson", topic: "hand-raise", actorId: "alice", revision: 11, handRaisedAt: "2026-10-13T12:00:00.000Z" };

test("channel hand updates show an already-seated student immediately without granting media or changing control revision", () => {
  const updated = applyClassroomHandRaiseUpdate(runtime, raised, "alice:tab")!;
  assert.equal(updated.members[1].handRaisedAt, raised.handRaisedAt);
  assert.equal(updated.members[1].onStage, true);
  assert.equal(updated.members[1].microphoneAllowed, false);
  assert.equal(updated.members[0], runtime.members[0]);
  assert.equal(updated.composition, runtime.composition);
  assert.equal(updated.revision, runtime.revision);
  assert.equal(runtime.members[1].handRaisedAt, null);
});

test("students may signal only their own registered RTM identity", () => {
  for (const publisher of [undefined, "bob:tab", "teacher:tab", "unknown"]) assert.equal(applyClassroomHandRaiseUpdate(runtime, raised, publisher), null);
  assert.equal(applyClassroomHandRaiseUpdate(runtime, { ...raised, actorId: "teacher" }, "teacher:tab"), null);
  assert.equal(applyClassroomHandRaiseUpdate(runtime, { ...raised, actorId: "missing" }, "missing:tab"), null);
});

test("duplicate, out-of-order, malformed and ended-class messages cannot restore a lowered hand", () => {
  const lowered = { ...raised, revision: 12, handRaisedAt: null };
  const updated = applyClassroomHandRaiseUpdate(runtime, lowered, "alice:tab", false, 11)!;
  assert.equal(updated.members[1].handRaisedAt, null);
  assert.equal(applyClassroomHandRaiseUpdate(updated, raised, "alice:tab", false, 12), null);
  for (const patch of [{ revision: 10 }, { revision: Infinity }, { revision: -1 }, { handRaisedAt: "invalid" }]) {
    assert.equal(applyClassroomHandRaiseUpdate(runtime, { ...raised, ...patch }, "alice:tab"), null);
  }
  assert.equal(applyClassroomHandRaiseUpdate({ ...runtime, status: "ended" }, raised, "alice:tab"), null);
  assert.equal(applyClassroomHandRaiseUpdate(runtime, { ...raised, revision: 1_000_000 }, "alice:tab")!.revision, 10);
});

test("server acknowledgments carry canonical timestamps and advance the confirmed revision", () => {
  assert.equal(applyClassroomHandRaiseUpdate(runtime, raised, undefined, true)!.revision, 11);
  assert.ok(applyClassroomHandRaiseUpdate(runtime, { ...raised, revision: 10 }, undefined, true));
  assert.equal(applyClassroomHandRaiseUpdate(runtime, { ...raised, revision: 9 }, undefined, true), null);
});

test("teacher queue includes onstage hands, sorts by first raise, and hides offline or teaching staff", () => {
  const hands = runtime.members.map((item, i) => ({ ...item, handRaisedAt: new Date(3000 - i * 1000).toISOString() }));
  const offline = { ...member("offline", "student"), online: false, handRaisedAt: new Date(0).toISOString() };
  assert.deepEqual(raisedClassroomHands([...hands, offline]).map(item => item.userId), ["bob", "alice"]);
  assert.equal(hands[1].userId, "alice", "sorting must not mutate the roster");
});

test("raise and lower opt into compact, retry-safe requests without stale layout revisions", async () => {
  for (const type of ["raiseHand", "lowerHand"] as const) {
    let calls = 0;
    const result = await requestClassroomAction("/actions", { action: { type }, clientId: "student-client", expectedRevision: 1 }, async (_, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.compactHandRaise, true);
      assert.equal(body.expectedRevision, undefined);
      return ++calls === 1 ? Response.json({ code: "database_unavailable" }, { status: 503 }) : Response.json({ handRaise: raised });
    }, async () => {});
    assert.equal(calls, 2);
    assert.deepEqual(result.payload.handRaise, raised);
  }
});
