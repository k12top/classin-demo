import assert from "node:assert/strict";
import test from "node:test";

import { classroomSelectorCycle } from "../src/lib/classroom/engagement";

test("random selector excludes students already selected in the active cycle", () => {
  assert.deepEqual(
    classroomSelectorCycle(
      ["student-1", "student-2", "student-3"],
      ["student-2"],
    ),
    {
      availableUserIds: ["student-1", "student-3"],
      selectedUserIds: ["student-2"],
      restarted: false,
    },
  );
});

test("random selector begins a new cycle only after every online student was selected", () => {
  assert.deepEqual(
    classroomSelectorCycle(
      ["student-1", "student-2"],
      ["student-1", "student-2", "student-offline"],
    ),
    {
      availableUserIds: ["student-1", "student-2"],
      selectedUserIds: [],
      restarted: true,
    },
  );
});

test("random selector de-duplicates candidates and ignores stale selections", () => {
  assert.deepEqual(
    classroomSelectorCycle(
      ["student-1", "student-1", "student-2"],
      ["student-offline"],
    ),
    {
      availableUserIds: ["student-1", "student-2"],
      selectedUserIds: [],
      restarted: false,
    },
  );
});
