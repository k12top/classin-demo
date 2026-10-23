import assert from "node:assert/strict";
import test from "node:test";
import { applyClassroomCompositionPreview } from "../src/lib/classroom/composition-preview";
import { emptyClassroomComposition, placeClassroomBoardItem } from "../src/lib/classroom/composition";
import type { ClassroomRuntimeSnapshot } from "../src/lib/classroom/types";
import type { ClassroomCompositionPreview } from "../src/lib/classroom/signaling/types";

const runtime = {
  status: "live", revision: 4, assistantPermissions: { assistant: true },
  members: [
    { userId: "teacher", role: "teacher", signalingUserIds: ["teacher:connection"] },
    { userId: "assistant", role: "assistant", signalingUserIds: ["assistant:connection"] },
    { userId: "student", role: "student", signalingUserIds: ["student:connection"] },
  ],
  composition: placeClassroomBoardItem(emptyClassroomComposition(), {
    id: "camera:student", kind: "camera", sourceId: "student", visible: true, locked: false,
    rect: { x: 0, y: 0, width: 0.27, height: 0.23 },
  }),
} as unknown as ClassroomRuntimeSnapshot;
const preview: ClassroomCompositionPreview = {
  courseId: "lesson", topic: "composition-preview", actorId: "teacher", itemId: "camera:student",
  rect: { x: 0.4, y: 0.3, width: 0.27, height: 0.23 }, sentAt: Date.now(),
};

test("lead and authorized assistant may move another member's camera without advancing the saved revision", () => {
  for (const actorId of ["teacher", "assistant"]) {
    const next = applyClassroomCompositionPreview(runtime, { ...preview, actorId }, `${actorId}:connection`, "viewer");
    assert.deepEqual(next?.composition.boardItems[0].rect, preview.rect);
    assert.equal(next?.revision, runtime.revision);
    assert.equal(runtime.composition.boardItems[0].rect.x, 0);
  }
});

test("own-camera ownership never authorizes students or explicitly revoked assistants", () => {
  assert.equal(applyClassroomCompositionPreview(runtime, { ...preview, actorId: "student" }, "student:connection", "teacher"), null);
  assert.equal(applyClassroomCompositionPreview({ ...runtime, assistantPermissions: { assistant: false } }, { ...preview, actorId: "assistant" }, "assistant:connection", "teacher"), null);
});

test("preview publisher must belong to the actual manager and self echoes are ignored", () => {
  for (const publisher of [undefined, "student:connection", "unknown:connection"]) {
    assert.equal(applyClassroomCompositionPreview(runtime, preview, publisher, "viewer"), null);
  }
  assert.equal(applyClassroomCompositionPreview(runtime, preview, "teacher:connection", "teacher"), null);
  assert.equal(applyClassroomCompositionPreview(runtime, { ...preview, actorId: "missing" }, "teacher:connection", "viewer"), null);
});

test("ended, locked, missing or malformed board previews cannot change the visible layout", () => {
  assert.equal(applyClassroomCompositionPreview({ ...runtime, status: "ended" }, preview, "teacher:connection", "viewer"), null);
  assert.equal(applyClassroomCompositionPreview({ ...runtime, composition: { ...runtime.composition, boardItems: runtime.composition.boardItems.map(item => ({ ...item, locked: true })) } }, preview, "teacher:connection", "viewer"), null);
  assert.equal(applyClassroomCompositionPreview(runtime, { ...preview, itemId: "missing" }, "teacher:connection", "viewer"), null);
  assert.equal(applyClassroomCompositionPreview(runtime, { ...preview, rect: { ...preview.rect, x: NaN } }, "teacher:connection", "viewer"), null);
});
