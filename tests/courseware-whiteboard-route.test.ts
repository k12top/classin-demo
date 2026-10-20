import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type Courseware } from "@prisma/client";
import { loadModule } from "./helpers/load-module";

type Api = typeof import("../src/app/api/courses/[id]/courseware/[coursewareId]/route");
function fixture(patch: Partial<Courseware> = {}) {
  let row: Courseware = { id: "file", courseId: "course", sessionId: null, name: "Lesson.pptx", ext: "pptx", size: 100, url: "oss://file", taskUuid: null, taskStatus: "Failed", type: "file", conversion: null, conversionError: "old error", whiteboardEnabled: true, studentCanView: true, studentCanDownload: true, createdAt: new Date(1), updatedAt: new Date(1), ...patch };
  let conversions = 0;
  let actor = "teacher";
  let failure = false;
  let conflict = false;
  let duringConversion: (() => void) | undefined;
  const api = loadModule<Api>("src/app/api/courses/[id]/courseware/[coursewareId]/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/session": { getSessionFromRequest: async () => ({ userId: "teacher", role: actor }) },
    "@/lib/course-teacher": { assertCanTeachCourse: async () => true },
    "@/lib/aliyun-oss": { getCoursewareObjectKey: () => "file", getCoursewareOssClient: () => ({ signatureUrl: () => "https://storage.test/?signature=secret" }) },
    "@/lib/db": { prisma: {
      courseware: {
        findFirst: async () => row, findUniqueOrThrow: async () => row,
        updateMany: async ({ where, data }: { where: Partial<Courseware>; data: Omit<Partial<Courseware>, "conversion"> & { conversion?: Courseware["conversion"] | typeof Prisma.DbNull } }) => {
          if (conflict || (where.updatedAt && where.updatedAt.getTime() !== row.updatedAt.getTime()) || (where.whiteboardEnabled !== undefined && where.whiteboardEnabled !== row.whiteboardEnabled)) return { count: 0 };
          row = { ...row, ...data, conversion: data.conversion === Prisma.DbNull ? null : (data.conversion ?? row.conversion) as Courseware["conversion"], updatedAt: new Date(row.updatedAt.getTime() + 1) };
          return { count: 1 };
        },
      }, classroomRuntime: { updateMany: async () => ({ count: 1 }) },
    } },
    "@/lib/whiteboard-convert": { startWhiteboardConversion: async () => {
      conversions++; duringConversion?.(); if (failure) throw new Error("HTTP 503");
      return { taskUuid: "new-task", status: "Pending", type: "dynamic" };
    } },
  });
  return {
    call: (body: unknown) => api.PATCH(new Request("https://test/courseware", { method: "PATCH", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: "course", coursewareId: "file" }) }),
    row: () => row, count: () => conversions,
    student: () => { actor = "student"; }, fail: () => { failure = true; }, conflict: () => { conflict = true; },
    removeWhileConverting: () => { duringConversion = () => { row = { ...row, whiteboardEnabled: false, taskUuid: null, updatedAt: new Date(row.updatedAt.getTime() + 1) }; }; },
  };
}

test("failed enabled courseware can be retried directly without toggling off", async () => {
  const f = fixture(); const response = await f.call({ whiteboardEnabled: true });
  assert.equal(response.status, 200); assert.equal(f.count(), 1); assert.equal(f.row().taskUuid, "new-task"); assert.equal(f.row().taskStatus, "Pending"); assert.equal(f.row().conversionError, null);
  assert.equal((await response.json()).courseware.url, undefined);
  await f.call({ whiteboardEnabled: true }); assert.equal(f.count(), 1, "pending task is reused");
});

test("failed remote tasks with UUIDs are replaced; permission changes alone do not start tasks", async () => {
  const f = fixture({ taskUuid: "old-task" });
  await f.call({ studentCanDownload: false }); assert.equal(f.count(), 0); assert.equal(f.row().taskUuid, "old-task");
  await f.call({ whiteboardEnabled: true }); assert.equal(f.count(), 1); assert.equal(f.row().taskUuid, "new-task");
});

test("conversion failure remains retryable and removal clears obsolete conversion data", async () => {
  const f = fixture({ conversion: { scenes: ["old"] } }); f.fail();
  assert.equal((await f.call({ whiteboardEnabled: true })).status, 502);
  assert.equal(f.row().taskStatus, "Failed"); assert.equal(f.row().conversionError, "HTTP 503");
  await f.call({ whiteboardEnabled: false });
  assert.equal(f.row().conversion, null); assert.equal(f.row().taskUuid, null); assert.equal(f.row().conversionError, null);
});

test("authorization, unsupported formats and concurrent updates stop before task creation", async () => {
  const student = fixture(); student.student(); assert.equal((await student.call({ whiteboardEnabled: true })).status, 403); assert.equal(student.count(), 0);
  const unsupported = fixture({ ext: "mp4", whiteboardEnabled: false }); assert.equal((await unsupported.call({ whiteboardEnabled: true })).status, 400); assert.equal(unsupported.row().whiteboardEnabled, false);
  const concurrent = fixture(); concurrent.conflict(); assert.equal((await concurrent.call({ whiteboardEnabled: true })).status, 409); assert.equal(concurrent.count(), 0);
});

test("late task creation cannot re-enable courseware removed while waiting for the provider", async () => {
  const f = fixture(); f.removeWhileConverting(); await f.call({ whiteboardEnabled: true });
  assert.equal(f.row().whiteboardEnabled, false); assert.equal(f.row().taskUuid, null);
});
