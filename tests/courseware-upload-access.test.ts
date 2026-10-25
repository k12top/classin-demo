import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";

type Policy = typeof import("../src/lib/courseware-upload-access");
type UploadRoute = typeof import("../src/app/api/courses/[id]/courseware/upload-url/route");
type CreateRoute = typeof import("../src/app/api/courses/[id]/courseware/route");
const assignedCourse = { ownerId: "owner", teacherId: "lead", teachers: [{ teacherId: "assistant" }] };

function fixture(identity: { userId: string; name: string; role: string } | null, course = assignedCourse) {
  const calls = { signed: 0, head: 0, created: 0, queried: [] as string[] };
  const prisma = {
    course: { findUnique: async ({ where }: { where: { id: string } }) => {
      calls.queried.push(where.id);
      return where.id === "course" ? course : null;
    } },
    courseSession: { findFirst: async ({ where }: { where: { id: string; courseId: string } }) => where.id === "lesson" && where.courseId === "course" ? { id: "lesson" } : null },
    courseware: { create: async ({ data }: { data: Record<string, unknown> }) => { calls.created++; return { ...data, id: "file" }; } },
  };
  const policy = loadModule<Policy>("src/lib/courseware-upload-access.ts", { "@/lib/db": { prisma }, "@/lib/course-session-roster": { getEffectiveSessionRoster: async () => ({ teachers: [{ userId: "lesson-helper" }] }) } });
  class StorageError extends Error { missingVariables = ["ALIYUN_OSS_BUCKET"]; }
  let storageFailure = false;
  const stubs = {
    "@/lib/classroom/server/redis-sync": { refreshClassroomRedisControl: async () => true },
    "next/server": { NextResponse: Response },
    "@/lib/session": { getSessionFromRequest: async () => identity },
    "@/lib/courseware-upload-access": policy,
    "@/lib/db": { prisma },
    "@/lib/courseware-access": {},
    "@/lib/courseware-conversion": {},
    "@/lib/aliyun-oss": {
      CoursewareStorageConfigurationError: StorageError,
      createCoursewareObjectKey: (courseId: string, filename: string) => `${courseId}/${filename}`,
      isCoursewareObjectKey: (courseId: string, key: string) => key.startsWith(`${courseId}/`),
      toCoursewareStorageUrl: (key: string) => `oss://${key}`,
      getCoursewareOssClient: () => {
        if (storageFailure) throw new StorageError();
        return { signatureUrl: () => { calls.signed++; return "https://storage.test/mock-upload"; }, head: async () => { calls.head++; } };
      },
    },
  };
  const upload = loadModule<UploadRoute>("src/app/api/courses/[id]/courseware/upload-url/route.ts", stubs);
  const create = loadModule<CreateRoute>("src/app/api/courses/[id]/courseware/route.ts", stubs);
  const call = (kind: "upload" | "create", courseId = "course", patch = {}, sessionId?: string) => {
    const body = kind === "upload" ? { filename: "lesson.pptx", contentType: "application/octet-stream", size: 100, ...patch } : { name: "Lesson", ext: "pptx", objectKey: `${courseId}/lesson.pptx`, size: 100, ...patch };
    return (kind === "upload" ? upload : create).POST(new Request(`https://test/courseware${sessionId ? `?sessionId=${sessionId}` : ""}`, { method: "POST", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: courseId }) });
  };
  return { call, calls, policy, failStorage: () => { storageFailure = true; } };
}

for (const kind of ["upload", "create"] as const) {
  for (const login of ["owner", "lead", "assistant"]) {
    test(`${kind}: assigned ${login} can use signed login name when session ID is a UUID`, async () => {
      const f = fixture({ userId: `uuid-${login}`, name: login, role: "teacher" });
      const response = await f.call(kind);
      assert.equal(response.status, kind === "upload" ? 200 : 201);
      assert.deepEqual(f.calls.queried, ["course"]);
      if (kind === "create") {
        const { courseware } = await response.json();
        assert.equal(courseware.whiteboardEnabled, false);
        assert.equal(courseware.url, undefined);
      }
    });
  }
  test(`${kind}: UUID assignment remains supported`, async () => {
    const f = fixture({ userId: "lead", name: "different-login", role: "teacher" });
    assert.equal((await f.call(kind)).status, kind === "upload" ? 200 : 201);
  });
  for (const identity of [null, { userId: "owner", name: "owner", role: "student" }, { userId: "student", name: "student", role: "student" }, { userId: "other", name: "other", role: "teacher" }]) {
    test(`${kind}: rejects ${identity ? identity.role + " " + identity.name : "anonymous"} before storage operations`, async () => {
      const f = fixture(identity);
      const response = await f.call(kind);
      assert.equal(response.status, identity ? 403 : 401);
      if (identity) assert.equal((await response.json()).code, "COURSEWARE_UPLOAD_FORBIDDEN");
      assert.equal(f.calls.signed + f.calls.head + f.calls.created, 0);
    });
  }
  test(`${kind}: an assignment in one course does not grant another course access`, async () => {
    const f = fixture({ userId: "uuid-owner", name: "owner", role: "teacher" });
    assert.equal((await f.call(kind, "other-course")).status, 403);
    assert.deepEqual(f.calls.queried, ["other-course"]);
    assert.equal(f.calls.signed + f.calls.head + f.calls.created, 0);
  });
  test(`${kind}: a qualified same-name teacher in another organization is denied`, async () => {
    const f = fixture({ userId: "tenant-b/lead", name: "lead", role: "teacher" }, {
      ownerId: "tenant-a/owner", teacherId: "tenant-a/lead", teachers: [{ teacherId: "tenant-a/assistant" }],
    });
    assert.equal((await f.call(kind)).status, 403);
    assert.equal(f.calls.signed + f.calls.head + f.calls.created, 0);
  });
}

test("qualified identities preserve organization boundaries, and display names grant no permission", () => {
  const { policy } = fixture(null);
  const teacher = { userId: "uuid", name: "lead", role: "teacher" as const, displayName: "owner" };
  const qualifiedCourse = { ...assignedCourse, ownerId: "tenant-a/owner", teacherId: "tenant-a/lead", teachers: [] };
  assert.equal(policy.canUploadCoursewareForCourse(teacher, qualifiedCourse, "tenant-a"), true);
  assert.equal(policy.canUploadCoursewareForCourse(teacher, qualifiedCourse, "tenant-b"), false);
  assert.equal(policy.canUploadCoursewareForCourse(teacher, qualifiedCourse, ""), false);
  assert.equal(policy.canUploadCoursewareForCourse({ ...teacher, userId: "tenant-b/lead" }, qualifiedCourse, "tenant-a"), false);
  assert.equal(policy.canUploadCoursewareForCourse({ ...teacher, userId: "tenant-b/lead", name: "tenant-a/lead" }, qualifiedCourse, ""), false);
  assert.equal(policy.canUploadCoursewareForCourse({ ...teacher, userId: "other", name: "other" }, assignedCourse, "tenant-a"), false);
});

test("upload feedback preserves storage errors and create rejects a cross-course object key", async () => {
  const f = fixture({ userId: "uuid", name: "owner", role: "teacher" });
  f.failStorage();
  const failure = await f.call("upload");
  assert.equal(failure.status, 503);
  assert.match((await failure.json()).error, /ALIYUN_OSS_BUCKET/);
  const other = fixture({ userId: "uuid", name: "owner", role: "teacher" });
  assert.equal((await other.call("create", "course", { objectKey: "other-course/private.pptx" })).status, 400);
  assert.equal(other.calls.head + other.calls.created, 0);
});

for (const kind of ["upload", "create"] as const) {
  test(`${kind}: lesson assistant uploads are bound to the authorized lesson`, async () => {
    const f = fixture({ userId: "uuid-helper", name: "lesson-helper", role: "teacher" });
    const response = await f.call(kind, "course", {}, "lesson");
    assert.equal(response.status, kind === "upload" ? 200 : 201);
    if (kind === "create") {
      const { courseware } = await response.json();
      assert.equal(courseware.sessionId, "lesson");
      assert.equal(courseware.studentCanView, true);
      assert.equal(courseware.studentCanDownload, true);
    }
  });
  test(`${kind}: unknown or foreign lesson is rejected before OSS`, async () => {
    const f = fixture({ userId: "uuid-helper", name: "lesson-helper", role: "teacher" });
    assert.equal((await f.call(kind, "course", {}, "other-lesson")).status, 403);
    assert.equal(f.calls.signed + f.calls.head + f.calls.created, 0);
  });
}
