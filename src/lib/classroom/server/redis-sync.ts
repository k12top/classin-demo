import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { classroomPgFallback, classroomRedisCommand, classroomRedisEnabled, classroomRedisKey, classroomRedisDiagnostics } from "./redis";
import type { RedisClassroomControl, RedisConnectionLease } from "./redis-presence";

const PUBLISH = `
local prior=redis.call('GET',KEYS[1])
if prior and cjson.decode(prior).version > ARGV[1] then return 0 end
local control=cjson.decode(ARGV[2])
local connections=cjson.decode(ARGV[3])
local known={}
for _,incoming in ipairs(connections) do
 known[incoming.id]=true
 local previous=redis.call('HGET',KEYS[2],incoming.id)
 if previous then
  previous=cjson.decode(previous)
  if incoming.leftAt == cjson.null and previous.leftAt == cjson.null then
   incoming.lastSeenAt=math.max(incoming.lastSeenAt,previous.lastSeenAt)
   incoming.registeredAt=previous.registeredAt
  end
 end
 redis.call('HSET',KEYS[2],incoming.id,cjson.encode(incoming))
end
for _,id in ipairs(redis.call('HKEYS',KEYS[2])) do
 if not known[id] then
  local removed=cjson.decode(redis.call('HGET',KEYS[2],id))
  if removed.leftAt == cjson.null then removed.leftAt=control.verifiedUntil-60000;redis.call('HSET',KEYS[2],id,cjson.encode(removed)) end
 end
end
redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[4]);redis.call('EXPIRE',KEYS[2],ARGV[4])
return 1`;
const pendingSyncs = new Map<string, Promise<boolean>>();
export function synchronizeClassroomRedis(sessionId: string, fresh = false): Promise<boolean> {
  const pending = pendingSyncs.get(sessionId);
  // A mutation must not reuse a read that began before its PG commit.
  if (pending) return fresh ? pending.then(() => synchronizeClassroomRedis(sessionId)) : pending;
  const work = (async () => {
    if (!classroomRedisEnabled() || classroomRedisDiagnostics().circuitOpen) return false;
    let version: string | undefined;
    try {
      const rows = await classroomPgFallback(`redis-control:${sessionId}`, () => prisma.$queryRaw<Array<{
        version: string; courseId: string | null; status: string | null; connections: RedisConnectionLease[];
      }>>`
        SELECT LPAD(s."version"::text,20,'0') AS version, r."courseId",
          CASE WHEN lesson."status" IN ('finished','cancelled') THEN 'ended' ELSE r."status" END AS status,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c."id",'userId',c."userId",'role',COALESCE(m."role",'student'),
            'rtcUid',c."rtcUid",'screenUid',c."screenUid",'lastSeenAt',FLOOR(EXTRACT(EPOCH FROM c."lastSeenAt")*1000),
            'registeredAt',FLOOR(EXTRACT(EPOCH FROM c."lastSeenAt")*1000),
            'leftAt',CASE WHEN c."leftAt" IS NULL THEN NULL ELSE FLOOR(EXTRACT(EPOCH FROM c."leftAt")*1000) END))
            FROM "ClassroomConnection" c LEFT JOIN "ClassroomMemberState" m ON m."sessionId"=c."sessionId" AND m."userId"=c."userId"
            WHERE c."sessionId"=s."sessionId" AND (c."leftAt" IS NULL OR c."leftAt">NOW()-INTERVAL '10 minutes')), '[]'::jsonb) AS connections
        FROM "ClassroomRedisSync" s LEFT JOIN "ClassroomRuntime" r ON r."sessionId"=s."sessionId"
        LEFT JOIN "CourseSession" lesson ON lesson."id"=s."sessionId" WHERE s."sessionId"=${sessionId}
      `);
      const source = rows[0];
      if (!source) return false;
      version = source.version;
      const control: RedisClassroomControl = { courseId: source.courseId || sessionId, status: source.status || "ended", version,
        verifiedUntil: Date.now() + 60_000 };
      const published = await classroomRedisCommand(["EVAL", PUBLISH, "2", classroomRedisKey(sessionId, "control"),
        classroomRedisKey(sessionId, "connections"), version, JSON.stringify(control), JSON.stringify(source.connections), "21600"]);
      if (published === undefined) throw new Error("redis_unavailable");
      // Only acknowledge this exact version. A newer PG commit must stay queued.
      await prisma.$executeRaw`UPDATE "ClassroomRedisSync" SET "processedAt"=NOW(),"attempts"=0,"lastError"=NULL
        WHERE "sessionId"=${sessionId} AND LPAD("version"::text,20,'0')=${version}`;
      return true;
    } catch {
      console.warn("[classroom:redis-sync]", { event: "pending", sessionId, version });
      if (version) {
        try { await prisma.$executeRaw`UPDATE "ClassroomRedisSync" SET "attempts"="attempts"+1,
          "nextAttemptAt"=NOW()+INTERVAL '5 seconds' * LEAST(60,POWER(2,LEAST("attempts",6))),"lastError"='sync_unavailable'
          WHERE "sessionId"=${sessionId} AND LPAD("version"::text,20,'0')=${version}`; } catch { /* PG outage leaves the durable row pending. */ }
      }
      return false;
    }
  })().finally(() => { if (pendingSyncs.get(sessionId) === work) pendingSyncs.delete(sessionId); });
  pendingSyncs.set(sessionId, work);
  return work;
}
const ACK = `for _,item in ipairs(cjson.decode(ARGV[1])) do
local current=redis.call('HGET',KEYS[1],item.id)
if current and tonumber(current) <= item.seen then redis.call('HDEL',KEYS[1],item.id) end end return 1`;
const RELEASE = `if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0`;
/** Redis contains retryable latest-value checkpoints; enter/leave and business data commit to PG first. */
export async function flushClassroomRedisPresence(sessionId: string): Promise<boolean> {
  if (!classroomRedisEnabled() || classroomRedisDiagnostics().circuitOpen) return false;
  const lockKey = classroomRedisKey(sessionId, "presence-sync-lock");
  const token = randomUUID();
  if (await classroomRedisCommand(["SET", lockKey, token, "NX", "PX", "10000"]) !== "OK") return false;
  try {
    const dirty = await classroomRedisCommand(["HGETALL", classroomRedisKey(sessionId, "dirty-presence")]);
    if (!Array.isArray(dirty)) return false;
    const entries: Array<{ id: string; seen: number }> = [];
    for (let i=0; i<dirty.length; i+=2) entries.push({ id: String(dirty[i]), seen: Number(dirty[i+1]) });
    if (!entries.length) return true;
    const acknowledged = await classroomPgFallback(`presence-checkpoint:${sessionId}`, () => prisma.$queryRaw<Array<{ id: string }>>`
      WITH incoming AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(entries)}::jsonb) AS x(id text,seen bigint)),
      eligible AS (
        SELECT c."id" FROM "ClassroomConnection" c JOIN incoming i ON c."id"=i.id
        WHERE c."sessionId"=${sessionId} AND c."leftAt" IS NULL
          AND EXISTS(SELECT 1 FROM "ClassroomRuntime" r WHERE r."sessionId"=${sessionId} AND r."status"<>'ended')
        FOR UPDATE OF c SKIP LOCKED
      ), refreshed AS (
        UPDATE "ClassroomConnection" c SET "lastSeenAt"=GREATEST(c."lastSeenAt",to_timestamp(i.seen/1000.0))
        FROM incoming i WHERE c."id"=i.id AND c."id" IN (SELECT "id" FROM eligible)
        RETURNING c."id",c."userId",c."lastSeenAt"
      ), latest AS (SELECT "userId",MAX("lastSeenAt") AS seen FROM refreshed GROUP BY "userId"),
      members AS (SELECT m."id" FROM "ClassroomMemberState" m JOIN latest ON m."userId"=latest."userId"
        WHERE m."sessionId"=${sessionId} FOR UPDATE OF m SKIP LOCKED), member_refresh AS (
      UPDATE "ClassroomMemberState" m SET "lastSeenAt"=GREATEST(m."lastSeenAt",latest.seen),"presence"='online'
      FROM latest WHERE m."id" IN (SELECT "id" FROM members) AND m."userId"=latest."userId" RETURNING m."id")
      SELECT "id" FROM refreshed
      UNION SELECT i.id FROM incoming i WHERE NOT EXISTS (
        SELECT 1 FROM "ClassroomConnection" c JOIN "ClassroomRuntime" r ON r."sessionId"=c."sessionId"
        WHERE c."id"=i.id AND c."sessionId"=${sessionId} AND c."leftAt" IS NULL AND r."status"<>'ended'
      )
    `);
    const ack = await classroomRedisCommand(["EVAL", ACK, "1", classroomRedisKey(sessionId, "dirty-presence"), JSON.stringify(entries.filter(entry => acknowledged.some(row => row.id === entry.id)))]);
    return ack !== undefined;
  } catch {
    console.warn("[classroom:redis-sync]", { event: "presence-checkpoint-pending", sessionId });
    return false;
  } finally { await classroomRedisCommand(["EVAL", RELEASE, "1", lockKey, token]); }
}
export async function drainClassroomRedisSync(limit = 20) {
  if (!classroomRedisEnabled()) return { synchronized: 0, pending: 0 };
  if (classroomRedisDiagnostics().circuitOpen) return { synchronized: 0, pending: null };
  const pending = await prisma.$queryRaw<Array<{ sessionId: string }>>`SELECT "sessionId" FROM "ClassroomRedisSync"
    WHERE "processedAt" IS NULL AND "nextAttemptAt"<=NOW() ORDER BY "nextAttemptAt" LIMIT ${limit}`;
  let synchronized = 0;
  for (const item of pending) if (await synchronizeClassroomRedis(item.sessionId)) synchronized++;
  // Rotate through rooms rather than permanently starving rooms beyond the first page.
  const active = await prisma.$queryRaw<Array<{ sessionId: string }>>`SELECT r."sessionId" FROM "ClassroomRuntime" r
    JOIN "ClassroomRedisSync" s ON s."sessionId"=r."sessionId"
    WHERE r."status"<>'ended' AND EXISTS (SELECT 1 FROM "ClassroomConnection" c WHERE c."sessionId"=r."sessionId"
      AND c."leftAt" IS NULL AND c."lastSeenAt">NOW()-INTERVAL '10 minutes')
    ORDER BY s."processedAt" ASC NULLS FIRST LIMIT 100`;
  for (const item of active) await flushClassroomRedisPresence(item.sessionId);
  // Successful control refresh moves a room to the end of the next cron batch.
  for (const item of active) await synchronizeClassroomRedis(item.sessionId);
  return { synchronized, pending: pending.length - synchronized };
}
