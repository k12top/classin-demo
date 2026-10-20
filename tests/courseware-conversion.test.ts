import assert from "node:assert/strict";
import test from "node:test";
import type { Courseware } from "@prisma/client";
import { loadModule } from "./helpers/load-module";
import type { ConversionResult } from "../src/lib/whiteboard-convert";

const item = (patch: Partial<Courseware> = {}): Courseware => ({ id: "file", courseId: "course", sessionId: null, name: "Lesson.pdf", ext: "pdf", size: 123, url: "oss://courseware/file", taskUuid: "task", taskStatus: "Converting", type: "static", conversion: null, whiteboardEnabled: true, studentCanView: true, studentCanDownload: true, conversionError: null, createdAt: new Date(), updatedAt: new Date(), ...patch });
type Api = typeof import("../src/lib/courseware-conversion");

test("live courseware advances Pending/Converting tasks and saves displayable pages", async () => {
  let writes = 0;
  const result: ConversionResult = { taskUuid: "task", status: "Finished", type: "static", scenes: [{ name: "1", ppt: { src: "https://cdn/1.png", width: 720, height: 1080 } }] };
  const api = loadModule<Api>("src/lib/courseware-conversion.ts", {
    "@/lib/db": { prisma: { courseware: { updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      assert.equal(where.taskUuid, "task"); assert.equal(where.whiteboardEnabled, true);
      assert.deepEqual(data.conversion, result); writes++; return { count: 1 };
    } } } },
    "@/lib/whiteboard-convert": { getWhiteboardConversionStatus: async () => result },
  });
  const [updated, disabled, finished] = await api.refreshCoursewareConversions([item(), item({ whiteboardEnabled: false }), item({ taskStatus: "Finished" })]);
  assert.equal(updated.taskStatus, "Finished"); assert.deepEqual(updated.conversion, result); assert.equal(writes, 1);
  assert.equal(disabled.whiteboardEnabled, false); assert.equal(finished.taskStatus, "Finished");
});

test("temporary polling failure preserves the task for the next classroom poll", async () => {
  const original = item();
  const api = loadModule<Api>("src/lib/courseware-conversion.ts", {
    "@/lib/db": { prisma: { courseware: { updateMany: () => assert.fail("must not terminally fail a query error") } } },
    "@/lib/whiteboard-convert": { getWhiteboardConversionStatus: async () => { throw new Error("network error"); } },
  });
  assert.deepEqual(await api.refreshCoursewareConversions([original]), [original]);
});

test("provider failure is saved for retry; stale completions cannot restore a removed document", async () => {
  const original = item();
  let stale = false;
  const api = loadModule<Api>("src/lib/courseware-conversion.ts", {
    "@/lib/db": { prisma: { courseware: {
      updateMany: async () => ({ count: stale ? 0 : 1 }),
      findUnique: async () => item({ whiteboardEnabled: false, taskUuid: null, taskStatus: "Pending" }),
    } } },
    "@/lib/whiteboard-convert": { getWhiteboardConversionStatus: async () => ({ taskUuid: "task", status: "Failed", type: "static", scenes: [], errorMessage: "conversion failed" }) },
  });
  const [failed] = await api.refreshCoursewareConversions([original]);
  assert.equal(failed.taskStatus, "Failed"); assert.equal(failed.conversionError, "conversion failed");
  stale = true;
  const [removed] = await api.refreshCoursewareConversions([original]);
  assert.equal(removed.whiteboardEnabled, false); assert.equal(removed.taskUuid, null);
});


test("polling uses a task's saved conversion region after the default changes", async () => {
  const api = loadModule<Api>("src/lib/courseware-conversion.ts", {
    "@/lib/db": { prisma: { courseware: {} } },
    "@/lib/whiteboard-convert": { getWhiteboardConversionStatus: async (_task: string, _type: string, region?: string) => {
      assert.equal(region, "cn-hz");
      return { taskUuid: "task", status: "Converting", type: "static", scenes: [], region };
    } },
  });
  const original = item({ conversion: { region: "cn-hz" } });
  assert.deepEqual(await api.refreshCoursewareConversions([original]), [original]);
});
