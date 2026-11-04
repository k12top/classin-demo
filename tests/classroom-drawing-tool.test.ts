import assert from "node:assert/strict";
import test from "node:test";
import { activeClassroomDrawingTool } from "@/lib/classroom/drawing-tool";

test("classroom whiteboard and screen annotation keep independent default tools", () => {
  assert.equal(activeClassroomDrawingTool(false, "pencil", "selector"), "pencil");
  assert.equal(activeClassroomDrawingTool(true, "pencil", "selector"), "selector");
});
