import "server-only";
import type { ClassroomRuntimeSnapshot } from "../types";
import { classroomConnectionPresence } from "../presence";
import { classroomRedisCommand, classroomRedisKey } from "./redis";

export type RedisClassroomControl = { courseId: string; status: string; version: string; verifiedUntil: number };
export type RedisConnectionLease = { id: string; userId: string; role: string; rtcUid: number; screenUid: number;
  lastSeenAt: number; leftAt: number | null; registeredAt: number };
export type RedisHeartbeat = { status: string; refreshed: boolean; reason: string; courseId: string; role: string; syncDue: boolean };
const TTL = "21600";
const HEARTBEAT = `
local control = redis.call('GET', KEYS[1])
if not control then return nil end
control = cjson.decode(control)
if control.verifiedUntil < tonumber(ARGV[2]) then return nil end
local value = redis.call('HGET', KEYS[2], ARGV[1])
if not value then return nil end
local lease = cjson.decode(value)
local result = {status=control.status,courseId=control.courseId,role=lease.role,refreshed=false,reason='left',syncDue=false}
if control.status == 'ended' then result.reason='ended'; return cjson.encode(result) end
if lease.leftAt ~= cjson.null then return cjson.encode(result) end
lease.lastSeenAt = math.max(lease.lastSeenAt, tonumber(ARGV[2]))
redis.call('HSET', KEYS[2], ARGV[1], cjson.encode(lease))
redis.call('HSET', KEYS[3], ARGV[1], tostring(lease.lastSeenAt))
redis.call('EXPIRE', KEYS[2], ARGV[3]); redis.call('EXPIRE', KEYS[3], ARGV[3])
result.refreshed=true;result.reason='refreshed'
result.syncDue=redis.call('SET', KEYS[4], ARGV[2], 'NX', 'EX', 60) ~= false
return cjson.encode(result)`;
export async function redisClassroomHeartbeat(sessionId: string, userId: string, clientId: string): Promise<RedisHeartbeat | null> {
  const result = await classroomRedisCommand(["EVAL", HEARTBEAT, "4", ...["control", "connections", "dirty-presence", "presence-sync-due"].map(key => classroomRedisKey(sessionId, key)), `${sessionId}:${userId}:${clientId}`, String(Date.now()), TTL]);
  return typeof result === "string" ? JSON.parse(result) as RedisHeartbeat : null;
}
export async function readRedisClassroomPresence(sessionId: string): Promise<RedisConnectionLease[] | null> {
  const response = await classroomRedisCommand(["HVALS", classroomRedisKey(sessionId, "connections")]);
  if (!Array.isArray(response)) return null;
  try { return response.map(value => JSON.parse(String(value)) as RedisConnectionLease); } catch { return null; }
}
export function overlayRedisClassroomPresence(snapshot: ClassroomRuntimeSnapshot, leases: RedisConnectionLease[] | null, now = Date.now()): ClassroomRuntimeSnapshot {
  if (!leases) return snapshot;
  return { ...snapshot, presenceObservedAt: new Date(now).toISOString(), members: snapshot.members.map(member => {
    const connections = leases.filter(lease => lease.userId === member.userId);
    if (!connections.length) return member;
    const open = connections.filter(lease => lease.leftAt === null && (!member.rtcUids || member.rtcUids.includes(lease.rtcUid)));
    const lastSeenAt = open.length ? new Date(Math.max(...open.map(lease => lease.lastSeenAt))) : new Date(member.lastSeenAt || now);
    const online = snapshot.status !== "ended" && open.some(lease => now - lease.lastSeenAt <= 45_000);
    return { ...member, ...classroomConnectionPresence({ lastSeenAt, online,
      mayReconnect: snapshot.status !== "ended" && (open.length > 0 || member.connectionStatus === "reconnecting") }, now),
      rtcUids: open.map(lease => lease.rtcUid), screenUids: open.map(lease => lease.screenUid) };
  }) };
}
