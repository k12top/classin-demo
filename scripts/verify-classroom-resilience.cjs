// Verification always creates an isolated loopback database, never using the configured DB.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node harness. */
const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const docker = process.env.DOCKER_BIN || (fs.existsSync("/Users/houshuai/.docker/bin/docker") ? "/Users/houshuai/.docker/bin/docker" : "docker");
const name = `classroom-resilience-${crypto.randomUUID()}`;
const password = crypto.randomUUID();
const database = `classroom_recovery_${Date.now()}`;
let container;
function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd: root, encoding: "utf8", ...options });
  if (result.error || result.status !== 0) throw result.error || new Error(`${path.basename(binary)} failed: ${result.stderr || result.status}`);
  return result.stdout;
}
async function verify() {
  container = execFileSync(docker, ["run", "--detach", "--name", name, "--tmpfs", "/var/lib/postgresql/data", "-e", `POSTGRES_PASSWORD=${password}`, "-e", `POSTGRES_DB=${database}`, "--publish", "127.0.0.1::5432", "postgres:16-alpine"], { encoding: "utf8" }).trim();
  const port = execFileSync(docker, ["port", container, "5432/tcp"], { encoding: "utf8" }).trim().split(":").at(-1);
  const env = { ...process.env, DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`, DATABASE_POOL_MAX: "3" };
  const deadline = Date.now() + 30_000;
  while (spawnSync(docker, ["exec", container, "pg_isready", "-U", "postgres", "-d", database], { stdio: "ignore" }).status !== 0) {
    if (Date.now() > deadline) throw new Error("Isolated PostgreSQL did not become ready");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  run(path.join(root, "node_modules/.bin/prisma"), ["migrate", "deploy"], { env });
  for (const suite of ["classroom-connections", "classroom-presence-stress"]) {
    run(process.execPath, [`tests/integration/${suite}.cjs`], { env, stdio: "inherit" });
  }
  run(docker, ["exec", container, "createdb", "-U", "postgres", "classroom_lifecycle_test"]);
  const lifecycleUrl = new URL(env.DATABASE_URL); lifecycleUrl.pathname = "/classroom_lifecycle_test";
  const lifecycleEnv = { ...env, DATABASE_URL: lifecycleUrl.toString() };
  run(path.join(root, "node_modules/.bin/prisma"), ["migrate", "deploy"], { env: lifecycleEnv });
  run(process.execPath, ["tests/integration/classroom-lifecycle.cjs"], { env: lifecycleEnv, stdio: "inherit" });
  console.log("PASS resilience verification on isolated PostgreSQL with pool max=3; production DB unchanged");
}
verify().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => {
  if (container) spawnSync(docker, ["rm", "--force", container], { stdio: "ignore" });
});
