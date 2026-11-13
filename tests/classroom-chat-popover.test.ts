import assert from "node:assert/strict";
import test from "node:test";
import { placeChatPopover } from "../src/lib/classroom/chat-popover-position";

test("chat popover stays fully inside the viewport near the right edge", () => {
  assert.deepEqual(
    placeChatPopover(
      { left: 860, right: 900, top: 80, bottom: 120 },
      { width: 240, height: 160 },
      { width: 920, height: 700 },
    ),
    { left: 660, top: 128 },
  );
});

test("chat popover opens above its trigger when there is not enough room below", () => {
  assert.deepEqual(
    placeChatPopover(
      { left: 260, right: 300, top: 610, bottom: 650 },
      { width: 240, height: 160 },
      { width: 920, height: 680 },
    ),
    { left: 60, top: 442 },
  );
});
