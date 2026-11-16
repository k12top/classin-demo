import assert from "node:assert/strict";
import test from "node:test";
import { classroomVideoPresets } from "../src/lib/classroom/config";

test("camera low and high streams keep the same aspect ratio across quality switches", () => {
  for (const preset of Object.values(classroomVideoPresets)) {
    assert.equal(
      preset.camera.low.width * preset.camera.high.height,
      preset.camera.high.width * preset.camera.low.height,
    );
  }
});
