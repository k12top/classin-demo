import assert from "node:assert/strict";
import test from "node:test";
import { insertCoursewareOnWhiteboard } from "../src/lib/classroom/courseware-insertion";
import type { ClassroomCoursewareSnapshot } from "../src/lib/classroom/types";

const ready: ClassroomCoursewareSnapshot = { id: "fixture", name: "Lesson.pdf", ext: "pdf", size: 100, taskUuid: "existing-task", taskStatus: "Finished", type: "static", conversion: { scenes: [{ name: "1", ppt: { src: "https://fixture.test/page.png", width: 800, height: 600 } }] }, conversionError: null, whiteboardEnabled: true, studentCanView: true, studentCanDownload: false, downloadUrl: null };

test("whiteboard insertion does not report completion until the SDK resolves", async () => {
  let finish!: () => void;
  let complete = false;
  const task = insertCoursewareOnWhiteboard({ insertDocs: async input => { assert.equal(input.fileType, "pdf"); await new Promise<void>(resolve => { finish = resolve; }); return "app-id"; } }, ready).then(() => { complete = true; });
  await Promise.resolve();
  assert.equal(complete, false);
  finish(); await task; assert.equal(complete, true);
});

test("failed SDK insertion rejects and can be explicitly retried", async () => {
  let calls = 0;
  const app = { insertDocs: async () => { calls++; if (calls === 1) throw new Error("SDK unavailable"); return "app-id"; } };
  await assert.rejects(insertCoursewareOnWhiteboard(app, ready), /SDK unavailable/);
  await insertCoursewareOnWhiteboard(app, ready);
  assert.equal(calls, 2);
});

test("unconverted/empty documents never reach the SDK, and dynamic documents use their real prefix", async () => {
  let calls = 0;
  const app = { insertDocs: async () => { calls++; return "app-id"; } };
  await assert.rejects(insertCoursewareOnWhiteboard(app, { ...ready, taskStatus: "Converting" }), /not_ready/);
  await assert.rejects(insertCoursewareOnWhiteboard(app, { ...ready, conversion: {} }), /EMPTY_CONVERSION/);
  await assert.rejects(insertCoursewareOnWhiteboard(app, { ...ready, type: "dynamic", conversion: {} }), /EMPTY_CONVERSION/);
  assert.equal(calls, 0);
  await insertCoursewareOnWhiteboard({ insertDocs: async input => { assert.equal(input.fileType, "pptx"); if (input.fileType === "pptx") assert.equal(input.url, "https://fixture.test/converted"); return "app-id"; } }, { ...ready, type: "dynamic", conversion: { prefix: "https://fixture.test/converted" } });
});
