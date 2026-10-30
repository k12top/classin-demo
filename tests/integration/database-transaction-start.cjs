// Real PostgreSQL regression for prisma/orm#29719. Never accepts a remote DB.
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, Prisma } = require('@prisma/client');
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (url.hostname !== '127.0.0.1' || !url.pathname.startsWith('/classroom_recovery_')) {
  throw new Error('Requires a disposable loopback classroom_recovery_* database');
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run() {
  const pool = new Pool({ connectionString: url.href, max: 1, connectionTimeoutMillis: 1000 });
  const observer = new Pool({ connectionString: url.href, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  let held;
  try {
    const [{ pid }] = await prisma.$queryRaw`SELECT pg_backend_pid() AS pid`;
    held = await pool.connect();
    // maxWait expires before the adapter can send BEGIN. When the slot is
    // released, the discarded late transaction must send ROLLBACK, then release.
    await assert.rejects(prisma.$transaction(async () => {}, { maxWait: 80, timeout: 2000 }), { code: 'P2028' });
    held.release(); held = null;
    for (let i = 0; i < 100 && (pool.waitingCount || !pool.idleCount); i++) await pause(20);
    const state = (await observer.query('SELECT state, query FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0];
    console.log(JSON.stringify({ clientVersion: Prisma.prismaVersion.client, observedState: state, waiting: pool.waitingCount }));
    if (process.argv.includes('--expect-leak')) {
      assert.equal(state.state, 'idle in transaction');
      // A regular read adopts the leaked transaction. Changing isolation on
      // the next checkout reproduces the production SQLSTATE 25001 error.
      await prisma.$queryRaw`SELECT 1`;
      await assert.rejects(prisma.$transaction(async () => {}, { isolationLevel: 'RepeatableRead' }), /SET TRANSACTION ISOLATION LEVEL/);
      console.log('REPRODUCED: late BEGIN leaked, then isolation-level failure');
    } else {
      assert.equal(state.state, 'idle');
      await prisma.$queryRaw`SELECT 1`;
      await prisma.$transaction(async tx => { await tx.$queryRaw`SELECT 1`; }, { isolationLevel: 'RepeatableRead' });
      const clean = (await observer.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=$1 AND state LIKE $2', [pid, 'idle in transaction%'])).rows[0];
      assert.equal(clean.n, 0);
      console.log('PASS: timed-out transaction start rolls back before reuse; RepeatableRead succeeds');
    }
  } finally {
    held?.release();
    await prisma.$disconnect();
    await observer.end();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
