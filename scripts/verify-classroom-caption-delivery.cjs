/* eslint-disable @typescript-eslint/no-require-imports -- Creates only a disposable loopback database. */
const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const name = `classroom-caption-delivery-${crypto.randomUUID()}`;
const password = crypto.randomUUID(), database = `classroom_captions_delivery_${Date.now()}`;
let container;
function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd: root, encoding: "utf8", ...options });
  if (result.error || result.status !== 0) throw result.error || Error(result.stderr || `${binary} failed (${result.status})`);
  return result.stdout;
}
(async () => {
  container = execFileSync("docker", ["run", "--detach", "--name", name, "--tmpfs", "/var/lib/postgresql/data", "-e", `POSTGRES_PASSWORD=${password}`, "-e", `POSTGRES_DB=${database}`, "--publish", "127.0.0.1::5432", "postgres:16-alpine"], { encoding: "utf8" }).trim();
  const port = run("docker", ["port", container, "5432/tcp"]).trim().split(":").at(-1);
  const env = { ...process.env, DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`, CLASSROOM_REDIS_URL: "", REDIS_URL: "", DATABASE_POOL_MAX: "3" };
  const deadline = Date.now() + 30_000;
  while (spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres", "-d", database], { stdio: "ignore" }).status !== 0) {
    if (Date.now() > deadline) throw Error("Disposable PostgreSQL did not become ready");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  run(path.join(root, "node_modules/.bin/prisma"), ["migrate", "deploy"], { env });
  run(process.execPath, ["tests/integration/classroom-caption-delivery.cjs"], { env, stdio: "inherit" });
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => {
  if (container) spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
});
