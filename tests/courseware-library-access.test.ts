import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";

type Access = typeof import("../src/lib/courseware-access");
type Library = typeof import("../src/app/api/courses/[id]/courseware/route");
type Download = typeof import("../src/app/api/courses/[id]/courseware/[coursewareId]/download/route");
type UploadPolicy = typeof import("../src/lib/courseware-upload-access");

function fixture(login = "learner", role = "student") {
  const identity = { userId: login, name: login, role };
  const lessons = [{ id: "a", title: "Lesson A" }, { id: "b", title: "Lesson B" }];
  const files = [
    { id: "shared", sessionId: null, studentCanView: true, studentCanDownload: true },
    { id: "a-file", sessionId: "a", studentCanView: true, studentCanDownload: true },
    { id: "b-file", sessionId: "b", studentCanView: true, studentCanDownload: true },
    { id: "hidden", sessionId: "a", studentCanView: false, studentCanDownload: false },
    { id: "restricted", sessionId: "a", studentCanView: true, studentCanDownload: false },
    { id: "excluded", sessionId: null, studentCanView: true, studentCanDownload: true },
  ].map(file => ({ ...file, courseId: "course", name: file.id, url: "oss://private" }));
  const course = { ownerId: "owner", teacherId: "lead", teachers: [], students: [], groupLinks: [] };
  const rules = [{ coursewareId: "excluded", action: "exclude" }];
  function matches(file: Record<string, unknown>, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (key === "OR") return (value as Record<string, unknown>[]).some(item => matches(file, item));
      if (value && typeof value === "object") {
        const rule = value as { in?: unknown[]; notIn?: unknown[] };
        return (!rule.in || rule.in.includes(file[key])) && (!rule.notIn || !rule.notIn.includes(file[key]));
      }
      return file[key] === value;
    });
  }
  const prisma = {
    course: { findUnique: async () => course },
    courseSession: {
      findMany: async () => lessons,
      findFirst: async ({ where }: { where: { id: string; courseId: string } }) => where.courseId === "course" ? lessons.find(lesson => lesson.id === where.id) : null,
    },
    courseSessionCourseware: {
      findMany: async () => rules,
      findUnique: async ({ where }: { where: { sessionId_coursewareId: { coursewareId: string } } }) => rules.find(rule => rule.coursewareId === where.sessionId_coursewareId.coursewareId) || null,
    },
    courseware: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => files.filter(file => matches(file, where)),
      findFirst: async ({ where }: { where: { id: string; courseId: string } }) => files.find(file => file.id === where.id && file.courseId === where.courseId),
    },
  };
  const roster = {
    getEffectiveSessionRoster: async (id: string) => ({ id, teachers: id === "a" ? [{ userId: "assistant" }] : [], students: id === "a" ? ["learner", "group-member"] : [] }),
    rosterContainsUser: (roster: { teachers: { userId: string }[]; students: string[] }, ids: string[]) => roster.teachers.some(teacher => ids.includes(teacher.userId)) ? { kind: "teacher" } : roster.students.some(id => ids.includes(id)) ? { kind: "student" } : null,
  };
  const teacher = {
    casdoorUserIdCandidates: (id: string) => [id],
    userCanTeachCourse: (_course: unknown, ids: string[]) => ids.includes("lead"),
  };
  const access = loadModule<Access>("src/lib/courseware-access.ts", {
    "@/lib/db": { prisma }, "@/lib/course-session-roster": roster,
    "@/lib/course-teacher": teacher, "@/lib/casdoor-user": { casdoorUserIdsMatch: (a: string, b: string) => a === b },
  });
  const upload = loadModule<UploadPolicy>("src/lib/courseware-upload-access.ts", { "@/lib/db": { prisma }, "@/lib/course-session-roster": roster });
  const stubs = {
    "@/lib/classroom/server/redis-sync": { refreshClassroomRedisControl: async () => true },
    "next/server": { NextResponse: Response }, "@/lib/db": { prisma },
    "@/lib/session": { getSessionFromRequest: async () => identity },
    "@/lib/courseware-access": access, "@/lib/courseware-upload-access": upload,
    "@/lib/courseware-conversion": { refreshCoursewareConversions: async (files: unknown) => files },
    "@/lib/aliyun-oss": {},
    "@/lib/courseware-file-response": { coursewareFileResponse: async () => new Response("file-content") },
  };
  const library = loadModule<Library>("src/app/api/courses/[id]/courseware/route.ts", stubs);
  const download = loadModule<Download>("src/app/api/courses/[id]/courseware/[coursewareId]/download/route.ts", stubs);
  function request(suffix = "") { const url = `https://test/materials${suffix}`; return Object.assign(new Request(url), { nextUrl: new URL(url) }) as never; }
  return { access, upload, identity, list: (suffix = "") => library.GET(request(suffix), { params: Promise.resolve({ id: "course" }) }), download: (id: string, suffix = "") => download.GET(request(suffix), { params: Promise.resolve({ id: "course", coursewareId: id }) }) };
}

for (const login of ["learner", "group-member"]) {
  test(`${login}: lesson-only library and download work without a session query`, async () => {
    const f = fixture(login);
    assert.equal((await f.access.resolveCoursewareAccess(f.identity, "course")).allowed, true);
    assert.equal(await f.access.canAccessCourseware(f.identity, "course"), false, "lesson access must not expand legacy whole-course recording access");
    const response = await f.list();
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.courseware.map((file: { id: string }) => file.id), ["shared", "a-file", "restricted"]);
    assert.equal(data.courseware.find((file: { id: string }) => file.id === "restricted").downloadUrl, null);
    assert.equal((await f.download("a-file")).status, 200);
    assert.equal((await f.download("b-file")).status, 403);
    assert.equal((await f.download("hidden")).status, 403);
    assert.equal((await f.download("restricted")).status, 403);
    assert.equal((await f.download("excluded")).status, 403);
    assert.equal((await f.list("?sessionId=b")).status, 403);
  });
}

test("outsiders cannot browse or download course materials", async () => {
  const f = fixture("outsider");
  assert.equal((await f.list()).status, 403);
  assert.equal((await f.download("shared")).status, 403);
});

test("lesson assistant can see hidden teaching materials and upload only to assigned lesson", async () => {
  const f = fixture("assistant", "teacher");
  const data = await (await f.list()).json();
  assert.deepEqual(data.uploadSessions.map((lesson: { id: string }) => lesson.id), ["a"]);
  assert(data.courseware.some((file: { id: string }) => file.id === "hidden"));
  assert.equal((await f.download("hidden")).status, 200);
  assert.equal(await f.upload.assertCanUploadCourseware(f.identity as never, "course", "a"), true);
  assert.equal(await f.upload.assertCanUploadCourseware(f.identity as never, "course", "b"), false);
  assert.equal(await f.upload.assertCanUploadCourseware(f.identity as never, "course"), false);
  assert.equal(await f.upload.assertCanUploadCourseware(f.identity as never, "other", "a"), false);
});

test("students never gain upload permission by selecting a teaching lesson", async () => {
  const f = fixture();
  assert.equal(await f.upload.assertCanUploadCourseware(f.identity as never, "course", "a"), false);
});
