import "server-only";
import { randomUUID } from "node:crypto";
import { coalesceClassroomRead } from "./read-coalescing";
import { classroomPgFallback, classroomRedisCommand, classroomRedisEnabled, classroomRedisKey } from "./redis";
import type { RedisClassroomControl } from "./redis-presence";
const STORE = `local control=redis.call('GET',KEYS[1]);if not control then return 0 end
if cjson.decode(control).version ~= ARGV[1] then return 0 end
redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3]);return 1`;
const RELEASE = `if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0`;
/** Short-lived shared reads. Authorization and all mutations always remain in PG. */
export function classroomSharedRead<T>(sessionId: string, scope: string, load: () => Promise<T>): Promise<T> {
  return coalesceClassroomRead(`shared:${sessionId}:${scope}`, async () => {
    if (!classroomRedisEnabled()) return load();
    const controlKey = classroomRedisKey(sessionId, "control");
    const cacheKey = classroomRedisKey(sessionId, `cache:${scope}`);
    const lockKey = classroomRedisKey(sessionId, `cache-lock:${scope}`);
    const read = async () => {
      const values = await classroomRedisCommand(["MGET", controlKey, cacheKey]);
      if (!Array.isArray(values)) return { unavailable: true };
      try {
        const control = values[0] ? JSON.parse(String(values[0])) as RedisClassroomControl : null;
        const cached = values[1] ? JSON.parse(String(values[1])) as { version: string; value: T } : null;
        return { control, hit: Boolean(control && cached && cached.version === control.version), value: cached?.value };
      } catch { return {}; }
    };
    let result = await read();
    if (result.hit) return result.value as T;
    if (result.unavailable || !result.control) return classroomPgFallback(`read:${sessionId}:${scope}`, load);
    const token = randomUUID();
    const acquired = await classroomRedisCommand(["SET", lockKey, token, "NX", "PX", "5000"]);
    if (acquired !== "OK") {
      for (let i = 0; i < 4; i++) {
        await new Promise(resolve => setTimeout(resolve, 40 + Math.random() * 20));
        result = await read();
        if (result.hit) return result.value as T;
        if (result.unavailable) break;
      }
      return classroomPgFallback(`read:${sessionId}:${scope}`, load);
    }
    try {
      const value = await classroomPgFallback(`read:${sessionId}:${scope}`, load);
      await classroomRedisCommand(["EVAL", STORE, "2", controlKey, cacheKey, result.control.version,
        JSON.stringify({ version: result.control.version, value }), "2000"]);
      return value;
    } finally { await classroomRedisCommand(["EVAL", RELEASE, "1", lockKey, token]); }
  });
}
