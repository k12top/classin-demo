/* eslint-disable @typescript-eslint/no-require-imports -- Disposable local PostgreSQL integration harness. */
const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const name = `classroom-summaries-${crypto.randomUUID()}`;
const password = crypto.randomUUID();
let container;
async function verify() {
  container = execFileSync("docker", ["run", "--detach", "--name", name, "--tmpfs", "/var/lib/postgresql/data", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=classroom_recovery_summary", "--publish", "127.0.0.1::5432", "postgres:16-alpine"], { encoding: "utf8" }).trim();
  const port = execFileSync("docker", ["port", container, "5432/tcp"], { encoding: "utf8" }).trim().split(":").at(-1);
  const env = { ...process.env, DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/classroom_recovery_summary`, DATABASE_POOL_MAX: "3", CLASSROOM_REDIS_URL: "", REDIS_URL: "" };
  const deadline = Date.now() + 30_000;
  while (spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { stdio: "ignore" }).status !== 0) {
    if (Date.now() > deadline) throw new Error("Disposable PostgreSQL did not start");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  execFileSync(path.join(root, "node_modules/.bin/prisma"), ["migrate", "deploy"], { cwd: root, env, stdio: "pipe" });
  console.log("PASS all migrations apply to disposable PostgreSQL");
  execFileSync(process.execPath, ["tests/integration/classroom-summaries.cjs"], { cwd: root, env, stdio: "inherit" });
}
verify().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => {
  if (container) spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
});
