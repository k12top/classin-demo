/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS acceptance runner. */
// Creates only a disposable, loopback database; never uses configured DB data.
const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
let container;
async function main() {
  const name = `classroom-public-api-${crypto.randomUUID()}`, password = crypto.randomUUID();
  container = execFileSync("docker", ["run", "--detach", "--name", name, "--tmpfs", "/var/lib/postgresql/data:rw,size=256m", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=public_course_api_test", "--publish", "127.0.0.1::5432", "postgres:16-alpine"], { encoding: "utf8" }).trim();
  const port = execFileSync("docker", ["port", container, "5432/tcp"], { encoding: "utf8" }).trim().split(":").at(-1);
  const env = { ...process.env, DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/public_course_api_test`, CLASSROOM_LIFECYCLE_WEBHOOK_URL: "", CLASSROOM_LIFECYCLE_WEBHOOK_SECRET: "" };
  const deadline = Date.now() + 30_000;
  while (spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { stdio: "ignore" }).status !== 0) {
    if (Date.now() > deadline) throw new Error("Disposable PostgreSQL startup timeout");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  execFileSync(path.join(root, "node_modules/.bin/prisma"), ["migrate", "deploy"], { cwd: root, env, stdio: "inherit" });
  const drift = execFileSync(path.join(root, "node_modules/.bin/prisma"), ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script"], { cwd: root, env, encoding: "utf8" });
  if (/^(CREATE|ALTER|DROP)\s/m.test(drift)) throw new Error(`Schema drift: ${drift}`);
  execFileSync(process.execPath, ["tests/integration/public-course-api.cjs"], { cwd: root, env, stdio: "inherit" });
  if (process.argv.includes("--production")) execFileSync(process.execPath, ["tests/integration/public-course-api-production.cjs"], { cwd: root, env, stdio: "inherit" });
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { if (container) spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" }); });
