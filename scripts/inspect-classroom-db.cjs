// Explicit DATABASE_URL only. Reads statistics; never logs SQL text or secrets.
const { Client } = require('pg');
async function inspect() {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('Explicit DATABASE_URL required'), { code: 'MISSING_DATABASE_URL' });
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000,
    statement_timeout: 3000, application_name: 'classroom-lock-inspection-readonly' });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const maxConnections = (await client.query('SHOW max_connections')).rows[0].max_connections;
    const activity = await client.query(`SELECT pid, state, wait_event_type, wait_event,
      EXTRACT(EPOCH FROM (now()-xact_start))::int AS transaction_age_seconds,
      EXTRACT(EPOCH FROM (now()-query_start))::int AS query_age_seconds,
      pg_blocking_pids(pid) AS blocking_pids,
      CASE WHEN query LIKE '%"ClassroomRuntime"%' THEN 'ClassroomRuntime'
        WHEN query LIKE '%"ClassroomMemberState"%' THEN 'ClassroomMemberState'
        WHEN query LIKE '%"ClassroomConnection"%' THEN 'ClassroomConnection'
        WHEN query LIKE '%"ClassroomActivity"%' THEN 'ClassroomActivity'
        WHEN query LIKE '%"ClassroomRedisSync"%' THEN 'ClassroomRedisSync' ELSE 'other' END AS resource,
      CASE WHEN query ~* '^\\s*BEGIN' THEN 'BEGIN' WHEN query ~* '^\\s*ROLLBACK' THEN 'ROLLBACK'
        WHEN query ~* '^\\s*SELECT' THEN 'SELECT' WHEN query ~* '^\\s*UPDATE' THEN 'UPDATE'
        WHEN query ~* '^\\s*INSERT' THEN 'INSERT' ELSE 'OTHER' END AS command
      FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()
      ORDER BY xact_start NULLS LAST LIMIT 100`);
    const locks = await client.query(`SELECT l.pid,l.locktype,l.mode,l.granted,c.relname AS relation
      FROM pg_locks l LEFT JOIN pg_class c ON c.oid=l.relation
      WHERE l.pid IN (SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid())
        AND (NOT l.granted OR c.relname IN ('ClassroomRuntime','ClassroomMemberState','ClassroomConnection','ClassroomActivity','ClassroomRedisSync'))
      ORDER BY l.granted,l.pid LIMIT 200`);
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), readOnly: true,
      maxConnections: Number(maxConnections), activity: activity.rows, locks: locks.rows }, null, 2));
  } finally { await client.end(); }
}
inspect().catch(error => { console.error(JSON.stringify({ status: 'inspection_unavailable', code: error.code || error.name })); process.exitCode = 1; });
