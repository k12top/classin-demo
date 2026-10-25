import "server-only";
import type { ClassroomRuntimeSnapshot } from "../types";
import { classroomConnectionPresence } from "../presence";
import { classroomRedisCommand, classroomRedisKey, classroomRedisEnabled } from "./redis";

export type RedisClassroomControl = { courseId: string; status: string; version: string; verifiedUntil: number; versions?: Record<string, string> };
export type RedisConnectionLease = { id: string; userId: string; role: string; rtcUid: number; screenUid: number;
  lastSeenAt: number; leftAt: number | null; registeredAt: number; replacedAt?: number | null };
export type RedisHeartbeat = { status: string; refreshed: boolean; reason: string; courseId: string; role: string; syncDue: boolean };
const TTL = "21600";
const HEARTBEAT = `
local control = redis.call('GET', KEYS[1])
if not control then return nil end
control = cjson.decode(control)
local clock=redis.call('TIME');ARGV[2]=tostring(tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000))
if control.verifiedUntil < tonumber(ARGV[2]) then return nil end
local value = redis.call('HGET', KEYS[2], ARGV[1])
if not value then return nil end
local lease = cjson.decode(value)
local result = {status=control.status,courseId=control.courseId,role=lease.role,refreshed=false,reason='left',syncDue=false}
if control.closing and tonumber(control.closingUntil or 0)>tonumber(ARGV[2]) then result.reason='busy'; return cjson.encode(result) end
if control.status == 'ended' then result.reason='ended'; return cjson.encode(result) end
if lease.replacedAt and lease.replacedAt ~= cjson.null then result.reason='replaced'; return cjson.encode(result) end
if lease.leftAt ~= cjson.null then return cjson.encode(result) end
lease.lastSeenAt = math.max(lease.lastSeenAt, tonumber(ARGV[2]))
redis.call('HSET', KEYS[2], ARGV[1], cjson.encode(lease))
redis.call('HSET', KEYS[3], ARGV[1], tostring(lease.lastSeenAt))
redis.call('ZADD',KEYS[5],'NX',ARGV[2],ARGV[1])
redis.call('EXPIRE',KEYS[3],ARGV[3]);redis.call('EXPIRE',KEYS[5],ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[3]); redis.call('EXPIRE', KEYS[3], ARGV[3])
result.refreshed=true;result.reason='refreshed'
result.syncDue=redis.call('SET', KEYS[4], ARGV[2], 'NX', 'EX', 15) ~= false
return cjson.encode(result)`;
export async function redisClassroomHeartbeat(sessionId: string, userId: string, clientId: string): Promise<RedisHeartbeat | null | undefined> {
  const result = await classroomRedisCommand(["EVAL", HEARTBEAT, "5", ...["control", "connections", "dirty-presence", "presence-sync-due", "dirty-order"].map(key => classroomRedisKey(sessionId, key)), `${sessionId}:${userId}:${clientId}`, String(Date.now()), TTL]);
  return result === undefined ? undefined : typeof result === "string" ? JSON.parse(result) as RedisHeartbeat : null;
}
export async function readRedisClassroomPresence(sessionId: string): Promise<RedisConnectionLease[] | null> {
  const response = await classroomRedisCommand(["HVALS", classroomRedisKey(sessionId, "connections")]);
  if (!Array.isArray(response)) return null;
  try { return response.map(value => JSON.parse(String(value)) as RedisConnectionLease); } catch { return null; }
}
export function overlayRedisClassroomPresence(snapshot: ClassroomRuntimeSnapshot, leases: RedisConnectionLease[] | null, now = Date.now()): ClassroomRuntimeSnapshot {
  if (!leases) return classroomRedisEnabled() ? { ...snapshot, presenceUncertain: true } : snapshot;
  const byUser = new Map<string, RedisConnectionLease[]>();
  for (const lease of leases) { const list = byUser.get(lease.userId) || []; list.push(lease); byUser.set(lease.userId, list); }
  return { ...snapshot, presenceUncertain: false, presenceObservedAt: new Date(now).toISOString(), members: snapshot.members.map(member => {
    const connections = byUser.get(member.userId) || [];
    if (!connections.length) return member;
    const open = connections.filter(lease => lease.leftAt === null && (!member.rtcUids || member.rtcUids.includes(lease.rtcUid)));
    const lastSeenAt = open.length ? new Date(Math.max(...open.map(lease => lease.lastSeenAt))) : new Date(member.lastSeenAt || now);
    const online = snapshot.status !== "ended" && open.some(lease => now - lease.lastSeenAt <= 45_000);
    return { ...member, ...classroomConnectionPresence({ lastSeenAt, online,
      mayReconnect: snapshot.status !== "ended" && (open.length > 0 || member.connectionStatus === "reconnecting") }, now),
      rtcUids: open.map(lease => lease.rtcUid), screenUids: open.map(lease => lease.screenUid) };
  }) };
}

const CLAIM_EMPTY = `
local raw=redis.call('GET',KEYS[1]);if not raw then return 0 end
local c=cjson.decode(raw);local clock=redis.call('TIME');local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
if c.status~='live' or c.verifiedUntil<now or (c.closing and tonumber(c.closingUntil or 0)>now) then return 0 end
local leases=redis.call('HVALS',KEYS[2]);if #leases==0 then return 0 end
for _,rawLease in ipairs(leases) do
 local l=cjson.decode(rawLease)
 if l.role=='teacher' or l.role=='assistant' or l.role=='student' then
  local absent=l.leftAt~=cjson.null and tonumber(l.leftAt) or tonumber(l.lastSeenAt)+120000
  if now-absent<tonumber(ARGV[2]) then return 0 end
 end
end
c.closing=ARGV[1];c.closingUntil=now+15000;redis.call('SET',KEYS[1],cjson.encode(c),'EX',21600);return 1`;
const RELEASE_EMPTY = `
local raw=redis.call('GET',KEYS[1]);if not raw then return 0 end
local c=cjson.decode(raw);if c.closing~=ARGV[1] then return 0 end
c.closing=nil;c.closingUntil=nil;if ARGV[2]=='1' then c.status='ended' end
redis.call('SET',KEYS[1],cjson.encode(c),'EX',21600);return 1`;
/** Linearize automatic close against lease renewal; unavailable/unknown means do not close. */
export async function claimRedisEmptyClassroom(sessionId: string, token: string, graceMs: number) {
  return await classroomRedisCommand(["EVAL",CLAIM_EMPTY,"2",classroomRedisKey(sessionId,"control"),classroomRedisKey(sessionId,"connections"),token,String(graceMs)])===1;
}
export async function releaseRedisEmptyClassroom(sessionId: string, token: string, ended: boolean) {
  await classroomRedisCommand(["EVAL",RELEASE_EMPTY,"1",classroomRedisKey(sessionId,"control"),token,ended ? "1":"0"]);
}
