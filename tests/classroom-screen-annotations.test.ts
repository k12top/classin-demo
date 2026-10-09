import assert from "node:assert/strict";
import test from "node:test";
import type { Room, View } from "white-web-sdk";
import {
  createScreenAnnotationController,
  createScreenAnnotationView,
  screenAnnotationViewport,
} from "../src/lib/classroom/whiteboard/screen-annotations";

test("screen markings use the contained video area and the same world scale across viewers", () => {
  const desktop = screenAnnotationViewport({ width: 1000, height: 800 }, { width: 1920, height: 1080 });
  const phone = screenAnnotationViewport({ width: 400, height: 600 }, { width: 1920, height: 1080 });
  assert.equal(desktop.top, 118.75);
  assert.equal(phone.top, 187.5);
  const worldX = 320;
  assert.equal((worldX * desktop.scale) / desktop.width, (worldX * phone.scale) / phone.width);
  const portrait = screenAnnotationViewport({ width: 1000, height: 800 }, { width: 600, height: 1000 });
  assert.equal(portrait.left, 260);
  assert.equal(portrait.height, 800);
});

test("readonly viewers wait for the shared annotation scene; existing strokes are never reset on join", () => {
  const scenes = new Set<string>();
  let inserts = 0;
  const room = {
    isWritable: true,
    phase: "connected",
    scenePathType: (path: string) => scenes.has(path) ? "page" : "none",
    putScenes: (directory: string) => { inserts++; scenes.add(`${directory}/annotations`); },
    views: { createView: () => ({}) },
  } as unknown as Room;
  assert.equal(createScreenAnnotationView(room, "main-123", false), null);
  assert.equal(inserts, 0);
  const writer = createScreenAnnotationView(room, "main-123", true)!;
  const reader = createScreenAnnotationView(room, "main-123", false)!;
  const rejoining = createScreenAnnotationView(room, "main-123", true)!;
  assert.equal(writer.focusScenePath, reader.focusScenePath);
  assert.equal(writer.focusScenePath, rejoining.focusScenePath);
  assert.equal(inserts, 1);
  assert.equal(writer.disableCameraTransform, true);
  assert.equal(writer.mode, 2);
  assert.notEqual(createScreenAnnotationView(room, "room-123", true)!.focusScenePath, writer.focusScenePath);
});

test("drawing, undo and clear target screen annotations without touching the teaching board", async () => {
  const calls: string[] = [];
  const memberState: Record<string, unknown> = {};
  const view = {
    focusScenePath: "/screen-annotations/main-123/annotations",
    setMemberState: (state: Record<string, unknown>) => Object.assign(memberState, state),
    undo: () => calls.push("undo"),
    redo: () => calls.push("redo"),
    cleanCurrentScene: () => calls.push("clear"),
  } as unknown as View;
  const room = { isWritable: true, phase: "connected", exportScene: async (path: string) => { calls.push(path); return new Blob(); } } as unknown as Room;
  const controller = createScreenAnnotationController(room, view, { dataset: {} } as HTMLDivElement);
  controller.setTool("ellipse");
  assert.equal(memberState.currentApplianceName, "ellipse");
  controller.setTool("eraser");
  assert.equal(memberState.currentApplianceName, "pencilEraser");
  controller.setStrokeColor([49, 198, 155]);
  controller.undo(); controller.redo(); controller.clear();
  await controller.exportBoard();
  assert.deepEqual(calls, ["undo", "redo", "clear", view.focusScenePath]);
  assert.deepEqual(memberState.textColor, [49, 198, 155]);
  Object.assign(room, { phase: "disconnected" });
  controller.setTool("pencil"); controller.clear(); controller.undo();
  assert.equal(calls.length, 4, "stale controls must not call a disconnected or released SDK view");
});
