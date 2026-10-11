/* eslint-disable @typescript-eslint/no-require-imports -- Disposable integration runner. */
const { execFileSync, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const docker = process.env.DOCKER_BIN || (fs.existsSync('/Users/houshuai/.docker/bin/docker') ? '/Users/houshuai/.docker/bin/docker' : 'docker');
const containers = [];
function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw result.error || new Error(`${path.basename(binary)} failed (${result.status})`);
  return result.stdout;
}
async function main() {
  const database = `classroom_recovery_redis_${Date.now()}`, pgPassword = randomUUID(), redisPassword = randomUUID();
  const pgName = `classroom-redis-pg-${randomUUID()}`, redisName = `classroom-redis-${randomUUID()}`;
  for (const [name, args] of [[pgName, ['--tmpfs', '/var/lib/postgresql/data', '-e', `POSTGRES_PASSWORD=${pgPassword}`, '-e', `POSTGRES_DB=${database}`, '--publish', '127.0.0.1::5432', 'postgres:16-alpine']], [redisName, ['--publish', '127.0.0.1::6379', process.env.CLASSROOM_TEST_REDIS_IMAGE || 'redis:7.4.10-bookworm', 'redis-server', '--requirepass', redisPassword, '--save', '', '--appendonly', 'no']]]) {
    execFileSync(docker, ['run', '--detach', '--name', name, ...args], { stdio: 'pipe' }); containers.push(name);
  }
  const port = (name, internal) => run(docker, ['port', name, `${internal}/tcp`]).trim().split(':').at(-1);
  const env = { ...process.env, DATABASE_URL: `postgresql://postgres:${pgPassword}@127.0.0.1:${port(pgName,5432)}/${database}`, DATABASE_POOL_MAX: '3',
    CLASSROOM_REDIS_URL: `redis://default:${redisPassword}@127.0.0.1:${port(redisName,6379)}`, CLASSROOM_REDIS_PREFIX: `classroom:test:${randomUUID()}`, REDIS_CONTAINER: redisName, DOCKER_BIN: docker };
  const deadline = Date.now() + 30_000;
  while (spawnSync(docker, ['exec', pgName, 'pg_isready', '-U', 'postgres', '-d', database], { stdio: 'ignore' }).status !== 0) {
    if (Date.now() > deadline) throw new Error('Disposable PG readiness timed out');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  run(path.join(root,'node_modules/.bin/prisma'), ['migrate','deploy'], { env, stdio: 'inherit' });
  run(process.execPath, ['tests/integration/classroom-redis.cjs'], { env, stdio: 'inherit' });
}
main().catch(error => { console.error(error.message); process.exitCode=1; }).finally(() => {
  for (const name of containers.reverse()) spawnSync(docker, ['rm','--force',name], { stdio:'ignore' });
});
