import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { NextRequest } from "next/server";

const now = Date.now();
const minute = 60_000;
const course = { id: "course", teacherId: "teacher", teacherName: "Teacher", teachers: [], students: [{ studentId: "student", studentName: "Student" }], groupLinks: [] };
function lesson(id: string, start: number, end: number, status = "live", endedAt: Date | null = null) {
  return { id, courseId: course.id, title: id, position: start, status, startTime: new Date(now + start * minute), endTime: new Date(now + end * minute), endedAt,
    roomUuid: id, roomType: 4, teacherMode: "inherit", studentMode: "inherit", leadTeacherId: "teacher", teachers: [], students: [], groupLinks: [], course };
}
type Lesson = ReturnType<typeof lesson>;
let rows: Lesson[] = [];
let fail = false;
const db = { courseSession: {
  async findUnique({ where }: { where: { id: string } }) { return rows.find(row => row.id === where.id) || null; },
  async findFirst({ where, orderBy = [] }: { where: Record<string, unknown>; orderBy?: Array<Record<string, string>> }) {
    if (fail) throw Object.assign(new Error("private connection detail must never reach the response"), { code: "P1001" });
    return rows.filter(row => Object.entries(where).every(([key, expected]) => {
      const actual = row[key as keyof Lesson];
      if (!expected || expected instanceof Date || typeof expected !== "object") return actual === expected;
      const condition = expected as { in?: unknown[]; gt?: Date; gte?: Date; lte?: Date };
      return (!condition.in || condition.in.includes(actual)) && (!condition.gt || (actual as Date) > condition.gt) &&
        (!condition.gte || (actual as Date) >= condition.gte) && (!condition.lte || (actual as Date) <= condition.lte);
    })).sort((a, b) => {
      for (const field of orderBy) for (const [key, direction] of Object.entries(field)) {
        const av = a[key as keyof Lesson] as unknown as number, bv = b[key as keyof Lesson] as unknown as number;
        if (av < bv) return direction === "asc" ? -1 : 1;
        if (av > bv) return direction === "asc" ? 1 : -1;
      }
      return 0;
    })[0] || null;
  },
  async update({ where, data }: { where: { id: string }; data: Partial<Lesson> }) {
    const row = rows.find(row => row.id === where.id)!;
    Object.assign(row, data);
    return row;
  },
} };
Object.assign(globalThis, { __courseEntryDb: db });
const root = process.cwd();
const stubs: Record<string, string> = {
  "@/lib/db": "export const prisma=globalThis.__courseEntryDb;export const databasePoolSnapshot=()=>null;export const isTransientDatabaseError=e=>e?.code==='P1001';",
  "@/lib/session": "export const getSessionFromRequest=async()=>({userId:'student',name:'student'});",
  "@/lib/join-link": "export const verifyShareAccessToken=async()=>({ok:false});",
  "server-only": "",
};
const bundled = build({ absWorkingDir: root, stdin: { contents: `export { resolveCourseSessionReference } from '@/lib/course-session-roster';export { resolveCourseSessionAccess,clearCourseSessionAccessCache } from '@/lib/course-session-access';export { GET as verifyEntry } from '@/app/api/courses/[id]/verify-access/route';`, resolveDir: root, loader: "ts" },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", tsconfig: "tsconfig.json", plugins: [{ name: "in-memory-entry-fixture", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "fixture" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }] });
const moduleObject = { exports: {} as { resolveCourseSessionReference: (id: string, type?: string) => Promise<Lesson | null>; resolveCourseSessionAccess: (id: string, user: string, options?: { referenceType: string }) => Promise<{ ok: boolean; sessionId?: string; code?: string }>; clearCourseSessionAccessCache: () => void; verifyEntry: (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response> } };
let api: typeof moduleObject.exports;
before(async () => {
  const bundle = await bundled;
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(`${root}/package.json`), moduleObject, moduleObject.exports);
  api = moduleObject.exports;
});
beforeEach(() => { fail = false; rows = [lesson("course", -90_000, -89_940, "finished"), lesson("current", -15, 45), lesson("future", 50, 110, "scheduled")]; api.clearCourseSessionAccessCache(); });

test("course entry skips the migrated finished lesson, while an explicit lesson remains exact", async () => {
  assert.equal((await api.resolveCourseSessionReference("course", "course"))?.id, "current");
  assert.equal((await api.resolveCourseSessionReference("course", "session"))?.id, "course");
  const current = await api.resolveCourseSessionAccess("course", "student", { referenceType: "course" });
  assert.equal(current.ok, true); assert.equal(current.sessionId, "current");
  const exact = await api.resolveCourseSessionAccess("course", "student", { referenceType: "session" });
  assert.equal(exact.ok, false); assert.equal(exact.code, "course_finished", "course access cache must not authorize the exact old session");
});
test("a currently scheduled lesson wins over stale live and earlier grace-period lessons", async () => {
  rows = [lesson("course", -400, -300), lesson("previous", -70, -10), lesson("current", -15, 45, "scheduled"), lesson("future", 50, 110, "scheduled")];
  assert.equal((await api.resolveCourseSessionReference("course", "course"))?.id, "current");
});
test("teacher-ended lessons stay closed and the next scheduled lesson can be selected", async () => {
  rows[1] = lesson("current", -15, 45, "afterClass", new Date(now));
  assert.equal((await api.resolveCourseSessionReference("course", "course"))?.id, "future");
  const ended = await api.resolveCourseSessionAccess("current", "student", { referenceType: "session" });
  assert.equal(ended.ok, false); assert.equal(ended.code, "course_finished");
});
test("scheduled deadlines include the configured grace period without resurrecting expired sessions", async () => {
  const delay = Number.parseInt(process.env.COURSE_FINISHED_DELAY_MINUTES || "30", 10);
  rows = [lesson("course", -delay - 60, -delay - 2), lesson("grace", -delay - 20, -1)];
  assert.equal((await api.resolveCourseSessionReference("course", "course"))?.id, "grace");
  rows[1].endedAt = new Date(now); rows[1].status = "finished";
  assert.equal((await api.resolveCourseSessionAccess("course", "student", { referenceType: "course" })).ok, false);
});
test("UTC and explicit UTC+08 timestamps identify the same scheduled interval", () => {
  assert.equal(Date.parse("2026-10-19T19:30:00+08:00"), Date.parse("2026-10-19T11:30:00Z"));
  assert.equal(Date.parse("2026-10-19T20:30:00+08:00"), Date.parse("2026-10-19T12:30:00Z"));
});
test("entry API returns the canonical current session URL and validates explicit session ownership", async () => {
  const request = (query = "") => new NextRequest(`http://localhost/api/courses/course/verify-access${query}`);
  const context = { params: Promise.resolve({ id: "course" }) };
  const response = await api.verifyEntry(request(), context); const body = await response.json();
  assert.equal(body.allowed, true); assert.equal(body.classroomUrl, "/classroom?sessionId=current");
  rows.push({ ...lesson("other", -10, 30), courseId: "other-course" });
  assert.equal((await api.verifyEntry(request("?sessionId=other"), context)).status, 404);
  const exact = await (await api.verifyEntry(request("?sessionId=course"), context)).json();
  assert.equal(exact.allowed, false); assert.equal(exact.code, "course_finished");
});
test("transient database outages return a retryable response without leaking connection details", async () => {
  fail = true;
  const response = await api.verifyEntry(new NextRequest("http://localhost/api/courses/course/verify-access"), { params: Promise.resolve({ id: "course" }) });
  assert.equal(response.status, 503); assert.equal(response.headers.get("Retry-After"), "2");
  assert.deepEqual(await response.json(), { error: "Database temporarily unavailable", code: "database_unavailable", retryable: true });
});
