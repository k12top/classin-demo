import assert from "node:assert/strict";
import test from "node:test";

import {
  bringClassroomBoardItemToFront,
  emptyClassroomComposition,
  normalizeBoardRect,
  normalizeClassroomComposition,
  orderClassroomSeats,
  placeClassroomBoardItem,
  touchComposition,
  translateBoardRectByPixels,
  updateClassroomBoardItem,
} from "../src/lib/classroom/composition";

test("composition clamps normalized board geometry to the shared canvas", () => {
  assert.deepEqual(
    normalizeBoardRect(
      { x: -2, y: 4, width: 2, height: 0.01 },
      "camera",
    ),
    { x: 0, y: 0.88, width: 0.96, height: 0.12 },
  );
});

test("board drag keeps the released pixel position on the shared canvas", () => {
  const moved = translateBoardRectByPixels(
    { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
    { x: 240, y: 120 },
    { width: 1200, height: 600 },
    "camera",
  );
  assert.ok(Math.abs(moved.x - 0.3) < Number.EPSILON);
  assert.equal(moved.y, 0.4);
  assert.equal(moved.width, 0.3);
  assert.equal(moved.height, 0.2);
  assert.deepEqual(
    translateBoardRectByPixels(
      { x: 0.1, y: 0.2, width: 0.78, height: 0.76 },
      { x: -900, y: 900 },
      { width: 1200, height: 600 },
      "screen",
    ),
    { x: 0, y: 0.24, width: 0.78, height: 0.76 },
  );
});

test("seat ordering keeps only available members and appends new seats", () => {
  assert.deepEqual(
    orderClassroomSeats(
      ["student-2", "missing", "teacher", "student-2"],
      ["teacher", "student-1", "student-2"],
    ),
    ["student-2", "teacher", "student-1"],
  );
});

test("placing the same camera replaces its prior board instance", () => {
  const first = placeClassroomBoardItem(emptyClassroomComposition(), {
    id: "camera:student-1:first",
    kind: "camera",
    sourceId: "student-1",
    rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 },
    locked: false,
    visible: true,
  });
  const second = placeClassroomBoardItem(first, {
    id: "camera:student-1:second",
    kind: "camera",
    sourceId: "student-1",
    rect: { x: 0.5, y: 0.4, width: 0.3, height: 0.2 },
    locked: true,
    visible: true,
  });
  assert.equal(second.boardItems.length, 1);
  assert.equal(second.boardItems[0]?.id, "camera:student-1:second");
  assert.equal(second.boardItems[0]?.locked, true);
});

test("composition updates geometry, layer order and audit metadata", () => {
  const placed = placeClassroomBoardItem(emptyClassroomComposition(), {
    id: "camera:teacher",
    kind: "camera",
    sourceId: "teacher",
    rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 },
    locked: false,
    visible: true,
  });
  const withScreen = placeClassroomBoardItem(placed, {
    id: "screen:student",
    kind: "screen",
    sourceId: "student",
    rect: { x: 0.05, y: 0.05, width: 0.8, height: 0.75 },
    locked: false,
    visible: true,
  });
  const updated = updateClassroomBoardItem(withScreen, "camera:teacher", {
    rect: { x: 0.65, y: 0.05, width: 0.28, height: 0.22 },
    locked: true,
    shape: "circle",
  });
  const front = bringClassroomBoardItemToFront(updated, "camera:teacher");
  const touched = touchComposition(
    front,
    "teacher",
    new Date("2026-08-18T09:00:00.000Z"),
  );
  assert.deepEqual(front.boardItems.map((item) => item.id), [
    "screen:student",
    "camera:teacher",
  ]);
  assert.equal(front.boardItems[1]?.locked, true);
  assert.equal(front.boardItems[1]?.shape, "circle");
  assert.equal(touched.updatedBy, "teacher");
  assert.equal(touched.updatedAt, "2026-08-18T09:00:00.000Z");
  assert.equal(normalizeClassroomComposition(touched).version, 1);
});

test("locking a board item preserves its geometry and camera shape", () => {
  const composition = placeClassroomBoardItem(emptyClassroomComposition(), {
    id: "camera:teacher",
    kind: "camera",
    sourceId: "teacher",
    rect: { x: 0.52, y: 0.31, width: 0.22, height: 0.22 },
    locked: false,
    visible: true,
    shape: "circle",
  });

  const updated = updateClassroomBoardItem(composition, "camera:teacher", {
    locked: true,
  });

  assert.deepEqual(updated.boardItems[0]?.rect, {
    x: 0.52,
    y: 0.31,
    width: 0.22,
    height: 0.22,
  });
  assert.equal(updated.boardItems[0]?.shape, "circle");
  assert.equal(updated.boardItems[0]?.locked, true);
});
