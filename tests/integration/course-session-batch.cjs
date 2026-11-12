/* eslint-disable @typescript-eslint/no-require-imports -- Node integration runner. */
// Run against a disposable loopback classroom_sessions_* PostgreSQL database.
// Authentication is isolated; the POST/PATCH routes, Prisma and writes are real.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const esbuild = require("esbuild");
const { Client } = require("pg");

async function main() {
  const database = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(database.hostname) && database.pathname.startsWith("/classroom_sessions_"), "requires a disposable loopback database");
  const delayMs = Number(process.env.DATABASE_QUERY_DELAY_MS || 0);
  const originalQuery = Client.prototype.query;
  let queryCount = 0;
  Client.prototype.query = async function (...args) {
    queryCount++;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return originalQuery.apply(this, args);
  };
  const root = path.resolve(__dirname, "../..");
  const directory = await fs.mkdtemp(path.join(root, "node_modules/.cache-session-batch-"));
  const output = path.join(directory, "api.cjs");
  const stubs = {
    "@/lib/session": 'export async function getSessionFromRequest() { return {userId:"batch-teacher",role:"teacher"}; }',
    "@/lib/course-teacher": 'export async function assertCanTeachCourse(){return true;} export function casdoorUserIdCandidates(id){return [...new Set([id,id.split("/").pop()])];}',
  };
  let db;
  const courseIds = [];
  try {
    await esbuild.build({
      stdin: { contents: `export {prisma} from '@/lib/db'; export {POST} from '@/app/api/courses/[id]/sessions/route'; export {PATCH} from '@/app/api/courses/[id]/sessions/[sessionId]/route'; export {createCourseSessions} from '@/lib/course-session-service'; export {buildSessionTeacherRules,sessionTeacherFromDirectory} from '@/lib/course-session-teachers'; export {getEffectiveSessionRoster} from '@/lib/course-session-roster';`, resolveDir: root },
      outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"),
      plugins: [{ name: "session-batch-isolation", setup(build) {
        build.onResolve({ filter: /.*/ }, ({ path: id }) => id in stubs ? { path: id, namespace: "stub" } : undefined);
        build.onLoad({ filter: /.*/, namespace: "stub" }, ({ path: id }) => ({ contents: stubs[id], loader: "js" }));
        if (process.env.COURSE_SESSION_BASELINE_FILE) {
          build.onLoad({ filter: /course-session-service\.ts$/ }, async () => ({ contents: await fs.readFile(process.env.COURSE_SESSION_BASELINE_FILE, "utf8"), loader: "ts", resolveDir: path.join(root, "src/lib") }));
        }
      } }],
    });
    const api = require(output);
    db = api.prisma;
    const createCourse = async (extra = {}) => {
      const course = await db.course.create({ data: {
        name: "Batch lessons", ownerId: "batch-teacher", ownerName: "Teacher",
        teacherId: "batch-teacher", teacherName: "Teacher", roomType: 4,
        publicApiManaged: true, lifecycleStatus: "draft", ...extra,
      } });
      courseIds.push(course.id);
      return course;
    };
    const schedule = { type: "recurring", timezone: "Asia/Shanghai", firstDate: "2026-10-13", localStartTime: "19:00", durationMinutes: 90, weekdays: [2] };
    const post = (courseId, body) => api.POST(new Request(`http://localhost/api/courses/${courseId}/sessions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: courseId }) });
    const reports = [];
    const course = await createCourse();
    if (process.env.COURSE_SESSION_BASELINE_FILE) {
      const warmup = await createCourse();
      const response = await post(warmup.id, { schedule: { type: "single", startTime: "2026-10-13T11:00:00Z", endTime: "2026-10-13T12:30:00Z" } });
      assert.equal(response.status, 201);
    }
    let previousCount = 0;
    for (const count of process.env.COURSE_SESSION_BASELINE_FILE ? [4, 5] : [1, 4, 5, 10, 50]) {
      const before = queryCount, start = Date.now();
      const response = await post(course.id, { schedule: { ...schedule, count } });
      const body = await response.json();
      reports.push({ count, status: response.status, milliseconds: Date.now() - start, queries: queryCount - before });
      if (process.env.COURSE_SESSION_BASELINE_FILE && count === 5) {
        assert.equal(response.status, 500, `baseline should reproduce the transaction timeout: ${JSON.stringify(reports)}`);
        assert.equal(await db.courseSession.count({ where: { courseId: course.id } }), previousCount);
        assert.equal(await db.courseSessionSeries.count({ where: { courseId: course.id } }), 1);
        console.log(JSON.stringify({ baseline: true, reports }));
        return;
      }
      assert.equal(response.status, 201, JSON.stringify(body));
      assert.equal(body.sessions.length, count);
      assert.deepEqual(body.sessions.map((session) => session.position), Array.from({ length: count }, (_, index) => previousCount + index + 1));
      assert.equal(new Set(body.sessions.map((session) => session.roomUuid)).size, count);
      assert.equal(new Set(body.sessions.map((session) => session.seriesId)).size, 1);
      for (const session of body.sessions) {
        assert.equal(session.teacherMode, "inherit");
        assert.equal(session.studentMode, "inherit");
        assert.deepEqual(session.teachers, []);
        assert.deepEqual(session.students, []);
        assert.deepEqual(session.groupLinks, []);
        assert.equal(new Date(session.endTime) - new Date(session.startTime), 90 * 60_000);
      }
      previousCount += count;
      assert.equal(await db.courseSession.count({ where: { courseId: course.id } }), previousCount);
    }
    for (const count of [0, -1, 51, 1.5, null]) {
      const response = await post(course.id, { schedule: { ...schedule, count } });
      assert.equal(response.status, 400, JSON.stringify(await response.json()));
    }
    assert.equal((await post(course.id, { schedule: { ...schedule, untilDate: "2027-09-28" } })).status, 400);
    assert.equal(await db.courseSession.count({ where: { courseId: course.id } }), previousCount);

    const group = await db.studentGroup.create({ data: { name: "Batch group", createdBy: "batch-teacher" } });
    try {
      const custom = await createCourse();
      const response = await post(custom.id, {
        schedule: { ...schedule, count: 50 }, teacherMode: "custom", studentMode: "custom",
        teachers: [{ userId: "batch-teacher", displayName: "Lead", role: "assistant" }, { userId: "assistant", displayName: "Assistant" }],
        students: [{ userId: "student", displayName: "Student" }, { userId: "excluded", action: "exclude" }],
        groups: [{ groupId: group.id }],
      });
      const body = await response.json();
      assert.equal(response.status, 201, JSON.stringify(body));
      assert.equal(body.sessions.length, 50);
      for (const session of body.sessions) {
        assert.equal(session.teachers.length, 2);
        assert.equal(session.teachers.find((teacher) => teacher.teacherId === "batch-teacher").role, "teacher");
        assert.equal(session.students.length, 2);
        assert.equal(session.students.find((student) => student.studentId === "excluded").action, "exclude");
        assert.equal(session.groupLinks[0].groupId, group.id);
      }
    } finally { await db.studentGroup.delete({ where: { id: group.id } }); }

    const standalone = await createCourse({ courseKind: "standalone" });
    assert.equal((await post(standalone.id, { schedule: { ...schedule, count: 5 } })).status, 400);
    const single = { type: "single", startTime: "2026-10-13T11:00:00Z", endTime: "2026-10-13T12:30:00Z" };
    assert.equal((await post(standalone.id, { schedule: single })).status, 201);
    assert.equal((await post(standalone.id, { schedule: single })).status, 409);

    const owner = { teacherId: "batch-teacher", teacherName: "nkwill" };
    const wang = api.sessionTeacherFromDirectory({ id: "azenglish", name: "azenglish", displayName: "王老师", casdoorUuid: "b6bc45e9-f7a1-4947-b76e-8c845a096375" }, []);
    const patch = (courseId, sessionId, body) => api.PATCH(new Request(`http://localhost/api/courses/${courseId}/sessions/${sessionId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: courseId, sessionId }) });
    for (const saved of [false, true]) {
      for (const mode of ["inherit", "custom"]) {
        const teachers = saved ? [owner, wang] : [owner];
        const teachingCourse = await createCourse({ teachers: { create: teachers } });
        const rules = api.buildSessionTeacherRules({ courseTeachers: teachers, availableTeachers: [owner, wang], selectedTeacherIds: [owner.teacherId, wang.teacherId], leadTeacherId: wang.teacherId, mode });
        for (const teachingSchedule of [
          { ...single, startTime: "2030-10-13T11:00:00Z", endTime: "2030-10-13T12:30:00Z" },
          { ...schedule, firstDate: "2030-10-15", count: 4 },
        ]) {
          const response = await post(teachingCourse.id, { schedule: teachingSchedule, teacherMode: mode, leadTeacherId: wang.teacherId, teachers: rules });
          const body = await response.json();
          assert.equal(response.status, 201, JSON.stringify({ saved, mode, body }));
          assert.equal(body.sessions.length, teachingSchedule.type === "single" ? 1 : 4);
          for (const session of body.sessions) {
            assert.equal(session.leadTeacherId, wang.teacherId);
            assert.equal(session.leadTeacherName, "王老师");
            const roster = await api.getEffectiveSessionRoster(session.id);
            assert.equal(roster.leadTeacherId, wang.teacherId);
            assert.equal(roster.teachers.find((teacher) => teacher.userId === wang.teacherId).role, "teacher");
          }
          const session = body.sessions[0];
          const edited = await patch(teachingCourse.id, session.id, { teacherMode: mode, leadTeacherId: wang.teacherId, teachers: rules, scope: "future" });
          assert.equal(edited.status, 200, JSON.stringify(await edited.json()));
          const rejected = await patch(teachingCourse.id, session.id, { teacherMode: "inherit", leadTeacherId: wang.teacherId, teachers: [{ userId: wang.teacherId, action: "exclude" }] });
          assert.equal(rejected.status, 400);
        }
        const beforeReject = await db.courseSession.count({ where: { courseId: teachingCourse.id } });
        assert.equal((await post(teachingCourse.id, { schedule: single, teacherMode: "inherit", leadTeacherId: wang.teacherId, teachers: [{ userId: wang.teacherId, action: "exclude" }] })).status, 400);
        assert.equal(await db.courseSession.count({ where: { courseId: teachingCourse.id } }), beforeReject);
        if (saved && mode === "inherit") {
          await db.courseTeacher.create({ data: { courseId: teachingCourse.id, teacherId: "future-assistant", teacherName: "Assistant" } });
          const lesson = await db.courseSession.findFirst({ where: { courseId: teachingCourse.id } });
          assert.ok((await api.getEffectiveSessionRoster(lesson.id)).teachers.some((teacher) => teacher.userId === "future-assistant"), "inherited lessons must follow later course roster additions");
        }
      }
    }

    const aliasCourse = await createCourse({ teacherId: "school/azenglish", teacherName: "王老师", teachers: { create: { teacherId: "school/azenglish", teacherName: "王老师" } } });
    const aliasResponse = await post(aliasCourse.id, { schedule: single, leadTeacherId: "azenglish" });
    const aliasSession = (await aliasResponse.json()).sessions?.[0];
    assert.equal(aliasResponse.status, 201);
    assert.equal(aliasSession.leadTeacherId, "school/azenglish");
    assert.equal((await patch(aliasCourse.id, aliasSession.id, { leadTeacherId: "azenglish" })).status, 200);

    const rollback = await createCourse();
    // Fail after series and session inserts, during roster insertion.
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_batch_student() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."studentId" = 'batch-failure' THEN RAISE EXCEPTION 'injected batch failure'; END IF; RETURN NEW; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_batch_student BEFORE INSERT ON "CourseSessionStudent" FOR EACH ROW EXECUTE FUNCTION reject_batch_student()`);
    try {
      await assert.rejects(api.createCourseSessions({ courseId: rollback.id, createdBy: "batch-teacher", schedule: { ...schedule, count: 50 }, students: [{ userId: "batch-failure" }] }), /injected batch failure/);
      assert.equal(await db.courseSession.count({ where: { courseId: rollback.id } }), 0);
      assert.equal(await db.courseSessionSeries.count({ where: { courseId: rollback.id } }), 0);
      assert.equal((await db.course.findUnique({ where: { id: rollback.id } })).lifecycleStatus, "draft");
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER reject_batch_student ON "CourseSessionStudent"`);
      await db.$executeRawUnsafe(`DROP FUNCTION reject_batch_student()`);
    }
    console.log(JSON.stringify({ passed: true, reports, checks: ["50 lessons with custom roster", "invalid counts rejected", "standalone rules retained", "saved and temporary Wang leads: single and recurring, inherited and custom", "editing and exclusions", "teacher identity aliases", "future roster inheritance", "atomic rollback"] }));
  } finally {
    if (db) {
      await db.course.deleteMany({ where: { id: { in: courseIds } } });
      await db.$disconnect();
    }
    Client.prototype.query = originalQuery;
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
