/* eslint-disable @typescript-eslint/no-require-imports -- Creates only disposable loopback PostgreSQL for class-start API acceptance. */
const { spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const docker = process.env.DOCKER_BIN || (fs.existsSync("/Users/houshuai/.docker/bin/docker") ? "/Users/houshuai/.docker/bin/docker" : "docker");
const database = "classroom_start_verification", password = crypto.randomUUID();
const name = "classroom-start-" + crypto.randomUUID();
let container;
function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error || result.status !== 0) throw result.error || new Error(`${path.basename(command)} failed (${result.status})`);
}
async function main() {
  container = execFileSync(docker, ["run", "--detach", "--name", name, "--tmpfs", "/var/lib/postgresql/data", "-e", `POSTGRES_PASSWORD=${password}`, "-e", `POSTGRES_DB=${database}`, "--publish", "127.0.0.1::5432", "postgres:16-alpine"], { encoding: "utf8" }).trim();
  const port = execFileSync(docker, ["port", container, "5432/tcp"], { encoding: "utf8" }).trim().split(":").at(-1);
  const env = { ...process.env, DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/${database}` };
  const deadline = Date.now() + 30000;
  while (spawnSync(docker, ["exec", container, "pg_isready", "-U", "postgres", "-d", database], { stdio: "ignore" }).status !== 0) {
    if (Date.now() > deadline) throw new Error("Disposable PostgreSQL startup timeout");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  run(path.join(root, "node_modules/.bin/prisma"), ["migrate", "deploy"], env);
  run(process.execPath, ["tests/integration/classroom-class-start.cjs"], env);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (container) spawnSync(docker, ["rm", "--force", container], { stdio: "ignore" });
});
