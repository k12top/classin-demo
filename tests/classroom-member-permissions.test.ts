import assert from "node:assert/strict";
import test from "node:test";
import { applyClassroomMemberPermissionUpdate } from "../src/lib/classroom/member-permissions";
import { applyMicrophonePermission } from "../src/lib/classroom/media-permissions";
import { classroomSignalingUserId } from "../src/lib/classroom/signaling/identity";
import { emptyClassroomComposition } from "../src/lib/classroom/composition";
import type { ClassroomRuntimeSnapshot, ClassroomMediaProvider, ClassroomMemberSnapshot } from "../src/lib/classroom/types";
import type { ClassroomMemberPermissionUpdate } from "../src/lib/classroom/signaling/types";

const member = (userId: string, role: ClassroomMemberSnapshot["role"]): ClassroomMemberSnapshot => ({
  userId, role, displayName: userId, avatar: "picture", online: true, onStage: true, stageState: "accepted",
  screenShareState: "idle", screenShareRequestedAt: null, microphoneAllowed: true, cameraAllowed: role !== "student",
  chatMuted: false, whiteboardWritable: false, handRaisedAt: null, rewardCount: 3, signalingUserIds: [`${userId}:tab`],
});
const runtime: ClassroomRuntimeSnapshot = { status: "live", revision: 10, assistantPermissions: { assistant: true },
  recordingStartMode: "classStart", startedAt: null, graceEndsAt: null, stageMode: "auto", stageLocked: false,
  spotlightUserId: null, activeCoursewareId: null, chatEnabled: true, timerStartedAt: null, timerDurationSec: null,
  timerPausedAt: null, interpretation: { enabled: false, provider: "shengwang", sourceLanguage: "zh-CN", targetLanguages: [], status: "stopped", error: null },
  composition: emptyClassroomComposition(), members: [member("teacher", "teacher"), member("assistant", "assistant"), member("student", "student")],
};
const patch: ClassroomMemberPermissionUpdate = { courseId: "lesson", topic: "member-permissions", actorId: "teacher", revision: 11, scope: "students", microphoneAllowed: false };

test("confirmed permission messages apply immediately and preserve unrelated member state", () => {
  const updated = applyClassroomMemberPermissionUpdate(runtime, patch, "teacher:tab")!;
  assert.equal(updated.revision, 11);
  assert.equal(updated.members[0], runtime.members[0]);
  assert.deepEqual(updated.members[2], { ...runtime.members[2], microphoneAllowed: false });
  const single = applyClassroomMemberPermissionUpdate(updated, { ...patch, revision: 12, scope: "member", targetUserId: "student", microphoneAllowed: true, cameraAllowed: true }, "teacher:tab")!;
  assert.equal(single.members[2].microphoneAllowed, true);
  assert.equal(single.members[2].cameraAllowed, true);
  assert.equal(runtime.members[2].microphoneAllowed, true);
});

test("permission messages authenticate the actual RTM publisher and reject stale or malformed updates", () => {
  for (const publisher of [undefined, "student:tab", "unknown"]) assert.equal(applyClassroomMemberPermissionUpdate(runtime, patch, publisher), null);
  assert.equal(applyClassroomMemberPermissionUpdate(runtime, { ...patch, actorId: "student" }, "student:tab"), null);
  assert.ok(applyClassroomMemberPermissionUpdate(runtime, { ...patch, actorId: "assistant" }, "assistant:tab"));
  assert.equal(applyClassroomMemberPermissionUpdate({ ...runtime, assistantPermissions: {} }, { ...patch, actorId: "assistant" }, "assistant:tab"), null);
  assert.equal(applyClassroomMemberPermissionUpdate({ ...runtime, status: "ended" }, patch, "teacher:tab"), null);
  for (const malformed of [{ revision: 10 }, { revision: Infinity }, { microphoneAllowed: "false" }, { cameraAllowed: "false" }, { scope: "anyone" }, { scope: "member", targetUserId: undefined }]) {
    assert.equal(applyClassroomMemberPermissionUpdate(runtime, { ...patch, ...malformed } as ClassroomMemberPermissionUpdate, "teacher:tab"), null);
  }
  assert.ok(applyClassroomMemberPermissionUpdate(runtime, patch, undefined, true), "authenticated HTTPS responses need no RTM publisher");
});

test("signaling identities remain stable across token renewal and fit the SDK byte limit", () => {
  assert.equal(classroomSignalingUserId("teacher:tab"), "teacher:tab");
  const long = "老师".repeat(40) + ":client-123456";
  assert.equal(classroomSignalingUserId(long), classroomSignalingUserId(long));
  assert.ok(Buffer.byteLength(classroomSignalingUserId(long)) <= 64);
  assert.notEqual(classroomSignalingUserId(long), classroomSignalingUserId(long + "other"));
});

function microphone(initial: boolean) {
  let on = initial, allowed = true, nativeEnabled = initial, calls = 0;
  const provider = { getSnapshot: () => ({ local: { microphoneOn: on } }),
    setMicrophonePermission: (value: boolean) => { allowed = value; nativeEnabled = allowed && on; },
    toggleMicrophone: async () => { calls++; on = !on; nativeEnabled = on && allowed; return on; },
  } as ClassroomMediaProvider;
  return { provider, get on() { return on; }, get nativeEnabled() { return nativeEnabled; }, get calls() { return calls; } };
}

test("restoring moderation resumes speaking microphones and leaves self-muted microphones off", async () => {
  for (const initial of [true, false]) {
    const mic = microphone(initial);
    await Promise.all(Array.from({ length: 8 }, () => applyMicrophonePermission(mic.provider, false)));
    assert.equal(mic.on, false); assert.equal(mic.nativeEnabled, false);
    await Promise.all(Array.from({ length: 8 }, () => applyMicrophonePermission(mic.provider, true)));
    assert.equal(mic.on, initial); assert.equal(mic.calls, initial ? 2 : 0);
  }
});

test("a mute immediately followed by restore leaves the native microphone usable", async () => {
  const mic = microphone(true);
  const muting = applyMicrophonePermission(mic.provider, false);
  assert.equal(mic.nativeEnabled, false, "native capture stops before the async SDK work");
  const restoring = applyMicrophonePermission(mic.provider, true);
  await Promise.all([muting, restoring]);
  assert.equal(mic.on, true); assert.equal(mic.nativeEnabled, true);
});

test("a new permission supersedes an in-flight mute even if the old SDK operation fails", async () => {
  let on = true, calls = 0, fail!: (error: Error) => void;
  const provider = { getSnapshot: () => ({ local: { microphoneOn: on } }),
    toggleMicrophone: async () => { calls++; on = !on; if (calls === 1) await new Promise<void>((_, reject) => { fail = reject; }); return on; },
  } as ClassroomMediaProvider;
  const muting = applyMicrophonePermission(provider, false);
  await new Promise(resolve => setImmediate(resolve));
  const restoring = applyMicrophonePermission(provider, true);
  fail(new Error("Old SDK request failed"));
  await Promise.all([muting, restoring]);
  assert.equal(on, true); assert.equal(calls, 2);
});
