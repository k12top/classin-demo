/* eslint-disable @typescript-eslint/no-require-imports -- Node/Electron CommonJS test runner. */
// Runs only against a new disposable loopback PostgreSQL; ignores local DB URL.
const { spawnSync, execFileSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const name = `classroom-lifecycle-test-${crypto.randomUUID()}`;
const password = crypto.randomUUID();
let container;
function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed (${result.status})`);
}
async function main() {
  container = execFileSync("docker", ["run", "--detach", "--name", name, "--tmpfs", "/var/lib/postgresql/data:rw,size=256m", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=classroom_lifecycle_test", "--publish", "127.0.0.1::5432", "postgres:16-alpine"], { encoding: "utf8" }).trim();
  const port = execFileSync("docker", ["port", container, "5432/tcp"], { encoding: "utf8" }).trim().split(":").at(-1);
  const env = { ...process.env, DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/classroom_lifecycle_test` };
  const deadline = Date.now() + 30_000;
  while (spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { stdio: "ignore" }).status !== 0) {
    if (Date.now() > deadline) throw new Error("Disposable PostgreSQL startup timeout");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  run(path.join(root, "node_modules/.bin/prisma"), ["migrate", "deploy"], env);
  const drift = execFileSync(path.join(root, "node_modules/.bin/prisma"), ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script"], { cwd: root, env, encoding: "utf8" });
  if (/^(CREATE|ALTER|DROP)\s/m.test(drift)) throw new Error(`Schema drift: ${drift}`);
  run(process.execPath, ["tests/integration/classroom-lifecycle.cjs"], env);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { if (container) spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" }); });
