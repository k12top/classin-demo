import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("session mutations refresh the parent course so the enter button updates immediately", async () => {
  const manager = await readFile(
    new URL("../src/components/course-sessions/course-session-manager.tsx", import.meta.url),
    "utf8",
  );
  const detail = await readFile(
    new URL("../src/components/TeacherCourseDetail.tsx", import.meta.url),
    "utf8",
  );

  assert.match(manager, /onSessionsChanged\?: \(\) => void \| Promise<void>/);
  assert.match(manager, /await onSessionsChanged\?\.\(\)/);
  assert.match(detail, /onSessionsChanged=\{fetchCourse\}/);
});
