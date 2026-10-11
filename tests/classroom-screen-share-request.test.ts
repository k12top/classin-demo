import assert from "node:assert/strict";
import test from "node:test";
import { applyClassroomScreenShareRequest } from "../src/lib/classroom/screen-share-request";
import { requestClassroomAction } from "../src/lib/classroom/action-request";
import { emptyClassroomComposition } from "../src/lib/classroom/composition";
import type { ClassroomMemberSnapshot, ClassroomRuntimeSnapshot } from "../src/lib/classroom/types";
import type { ClassroomScreenShareRequest } from "../src/lib/classroom/signaling/types";

const now = Date.parse("2026-10-11T08:00:00Z");
const member = (userId: string, role: ClassroomMemberSnapshot["role"]): ClassroomMemberSnapshot => ({
  userId, role, displayName: userId, avatar: "", online: true, onStage: false, stageState: "offstage",
  screenShareState: "idle", screenShareRequestedAt: null, microphoneAllowed: false, cameraAllowed: false,
  chatMuted: false, whiteboardWritable: false, handRaisedAt: null, rewardCount: 0, signalingUserIds: [`${userId}:tab`],
});
const runtime: ClassroomRuntimeSnapshot = {
  status: "live", revision: 10, assistantPermissions: { assistant: true }, recordingStartMode: "classStart",
  startedAt: null, graceEndsAt: null, stageMode: "auto", stageLocked: false, spotlightUserId: null,
  activeCoursewareId: null, chatEnabled: true, timerStartedAt: null, timerDurationSec: null, timerPausedAt: null,
  interpretation: { enabled: false, provider: "shengwang", sourceLanguage: "zh-CN", targetLanguages: [], status: "stopped", error: null },
  composition: emptyClassroomComposition(), members: [member("teacher", "teacher"), member("assistant", "assistant"), member("student", "student")],
};
const invitation: ClassroomScreenShareRequest = { courseId: "lesson", topic: "screen-share-request", actorId: "teacher",
  revision: 11, targetUserId: "student", requestedAt: new Date(now).toISOString() };
const apply = (request = invitation, publisherId: string | undefined = "teacher:tab", snapshot = runtime) =>
  applyClassroomScreenShareRequest(snapshot, request, publisherId, false, now);

test("a verified invitation shows the request without granting capture or changing other member state", () => {
  const updated = apply()!;
  assert.equal(updated.revision, 11);
  assert.equal(updated.members[0], runtime.members[0]);
  assert.deepEqual(updated.members[2], { ...runtime.members[2], screenShareState: "requested", screenShareRequestedAt: invitation.requestedAt });
  assert.equal(updated.composition, runtime.composition);
  assert.equal(updated.members[2].onStage, false);
  assert.equal(runtime.members[2].screenShareState, "idle");
  assert.equal(apply(invitation, "teacher:tab", updated), null, "duplicate delivery is ignored");
});

test("requests require the actual teacher or authorized assistant RTM publisher", () => {
  for (const publisher of ["unknown", "student:tab"]) assert.equal(apply(invitation, publisher), null);
  assert.equal(applyClassroomScreenShareRequest(runtime, invitation, undefined, false, now), null);
  assert.equal(apply({ ...invitation, actorId: "student" }, "student:tab"), null);
  const assistant = { ...invitation, actorId: "assistant" };
  assert.ok(apply(assistant, "assistant:tab"));
  assert.equal(apply(assistant, "assistant:tab", { ...runtime, assistantPermissions: {} }), null);
  assert.ok(applyClassroomScreenShareRequest(runtime, invitation, undefined, true, now));
});

test("stale, expired, malformed and invalid-target invitations cannot reopen a dialog", () => {
  for (const update of [{ revision: 10 }, { revision: Infinity }, { requestedAt: "invalid" },
    { requestedAt: new Date(now - 120_001).toISOString() }, { targetUserId: "teacher" }, { targetUserId: "missing" }]) {
    assert.equal(apply({ ...invitation, ...update }), null);
  }
  assert.equal(apply(invitation, "teacher:tab", { ...runtime, status: "ended" }), null);
});

test("sharing requests opt into a compact response while retaining server confirmation", async () => {
  let body: Record<string, unknown> = {};
  const result = await requestClassroomAction("/actions", {
    clientId: "teacher-tab", expectedRevision: 1, action: { type: "requestScreenShare", targetUserId: "student" },
  }, async (_, init) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ screenShareRequest: invitation });
  });
  assert.equal(body.compactScreenShareRequest, true);
  assert.equal("expectedRevision" in body, false);
  assert.deepEqual(result.payload.screenShareRequest, invitation);
  assert.equal(result.payload.runtime, undefined);
});
