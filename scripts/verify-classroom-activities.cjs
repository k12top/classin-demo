/** Creates ONLY a disposable local DB; never reads the configured DATABASE_URL. */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFileSync, spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const docker = process.env.DOCKER_BIN || (fs.existsSync("/Users/houshuai/.docker/bin/docker") ? "/Users/houshuai/.docker/bin/docker" : "docker");
const taskId = crypto.randomUUID();
const name = "classroom-activity-verification-" + taskId;
const password = crypto.randomUUID();
let container, temp;
function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd: root, encoding: "utf8", ...options });
  if (result.error || result.status !== 0) throw result.error || new Error(`${path.basename(binary)} failed (${result.status}): ${result.stderr || "see output"}`);
  return result.stdout;
}
async function verify() {
  temp = await fsp.mkdtemp(path.join(os.tmpdir(), "classroom-activity-db-"));
  container = execFileSync(docker, ["run", "--detach", "--name", name, "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=activities", "--publish", "127.0.0.1::5432", "postgres:16-alpine"], { encoding: "utf8" }).trim();
  const port = execFileSync(docker, ["port", container, "5432/tcp"], { encoding: "utf8" }).trim().split(":").at(-1);
  const env = { ...process.env, DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/activities` };
  const until = Date.now() + 30000;
  while (true) {
    const ready = spawnSync(docker, ["exec", container, "pg_isready", "-U", "postgres", "-d", "activities"], { stdio: "ignore" });
    if (ready.status === 0) break;
    if (Date.now() > until) throw new Error("Temporary PostgreSQL did not become ready");
    await new Promise(r => setTimeout(r, 250));
  }
  run(path.join(root, "node_modules/.bin/prisma"), ["migrate", "deploy"], { env });
  const drift = run(path.join(root, "node_modules/.bin/prisma"), ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script"], { env });
  if (/^(CREATE|ALTER|DROP)\s/m.test(drift)) throw new Error("Fresh schema differs from Prisma schema:\n" + drift);
  const fixtureSql = `INSERT INTO "Course" ("id", "name", "ownerId", "ownerName", "teacherId", "teacherName", "updatedAt", "studentRemarks", "recordUrl", "passcode", "startTime") VALUES ('legacy-verification', 'Existing course', 'teacher', 'Teacher', 'teacher', 'Teacher', CURRENT_TIMESTAMP, 'Keep these remarks', '/private/replay', '123456', '2026-10-01T10:00:00Z');
INSERT INTO "Courseware" ("id", "courseId", "name", "ext", "url", "updatedAt", "studentCanView", "studentCanDownload", "whiteboardEnabled", "conversion") VALUES ('legacy-resource', 'legacy-verification', 'Existing file', 'pdf', '/private/existing.pdf', CURRENT_TIMESTAMP, false, false, true, '{"pages": 3}');`;
  const psql = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "activities", "-v", "ON_ERROR_STOP=1", "-At"];
  run(docker, psql, { input: fixtureSql });
  const snapshot = `SELECT row_to_json(c)::text FROM "Course" c WHERE "id"='legacy-verification'; SELECT row_to_json(w)::text FROM "Courseware" w WHERE "id"='legacy-resource';`;
  const before = run(docker, psql, { input: snapshot });
  run(docker, psql, { input: await fsp.readFile(path.join(root, "prisma/migrations/20260727120000_legacy_schema_baseline/migration.sql"), "utf8") });
  const after = run(docker, psql, { input: snapshot });
  if (before !== after) throw new Error("Baseline repair changed existing course/courseware data");
  run(docker, psql, { input: `DELETE FROM "Course" WHERE "id"='legacy-verification';` });
  console.log("Verified the complete migration chain, Prisma schema parity and existing course/courseware preservation on isolated PostgreSQL.");
  const reportDir = path.join(root, "clients/desktop/dist/verification"); await fsp.mkdir(reportDir, { recursive: true });
  await fsp.writeFile(path.join(reportDir, "activities-migrations.json"), JSON.stringify({ passed: true, database: "isolated PostgreSQL16", checks: ["empty database full migration chain", "no Prisma schema drift", "guarded baseline preserves existing course and courseware rows, dates, permissions and conversion metadata"], productionDatabaseChanged: false }, null, 2));
  run(process.execPath, ["tests/integration/classroom-activities.cjs"], { env, stdio: "inherit" });
  run(process.execPath, ["tests/integration/classroom-chat-images.cjs"], { env, stdio: "inherit" });
  if (!process.argv.includes("--database-only")) {
    run(path.join(root, "clients/desktop/node_modules/.bin/electron"), ["tests/integration/classroom-chat-ui.cjs"], { env, stdio: "inherit" });
    if (!process.argv.includes("--chat-only")) run(path.join(root, "clients/desktop/node_modules/.bin/electron"), ["tests/integration/classroom-activity-workspace-ui.cjs"], { env, stdio: "inherit" });
  }
}
async function cleanup() {
  if (container) spawnSync(docker, ["rm", "--force", container], { stdio: "ignore" });
  if (temp) await fsp.rm(temp, { recursive: true, force: true });
}
verify().then(async () => { await cleanup(); }, async e => { console.error(e.message); await cleanup(); process.exitCode = 1; });
