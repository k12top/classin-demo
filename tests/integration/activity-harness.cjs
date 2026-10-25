const path = require("node:path");
const fs = require("node:fs/promises");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
async function openHarness() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.startsWith("/activities")) throw new Error("Acceptance requires an isolated loopback activities database");
  const output = path.join(root, "node_modules/.cache/activity-acceptance/server.cjs");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await esbuild.build({ entryPoints: [path.join(root, "src/lib/classroom/server/activities.ts")], outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{ name: "server-only-test", setup(build) { build.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" })); build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" })); } }] });
  const api = require(output);
  const { PrismaClient } = require("@prisma/client"); const { PrismaPg } = require("@prisma/adapter-pg");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  // The server module exports its shared Prisma client only through the ordinary
  // DB module; process exit closes that separate adapter after each acceptance.
  const course = await db.course.create({ data: { name: "Activity acceptance", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher" } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: "Real DB activity lesson", startTime: new Date(), endTime: new Date(Date.now() + 3600000), createdBy: "teacher" } });
  const runtime = await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, status: "live", assistantPermissions: { assistant: true } } });
  for (const userId of ["student", "student2"]) await db.classroomMemberState.create({ data: { runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, userId, displayName: userId, role: "student", presence: "online" } });
  const actor = (userId, role = userId === "teacher" ? "teacher" : userId === "assistant" ? "assistant" : "student") => ({ courseId: course.id, sessionId: lesson.id, userId, displayName: userId, role });
  return { api, db, course, lesson, runtime, actor, async close() { await db.course.delete({ where: { id: course.id } }); await db.$disconnect(); } };
}
module.exports = { openHarness };
