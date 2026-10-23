import "server-only";
import { randomUUID } from "node:crypto";
import { coalesceClassroomRead } from "./read-coalescing";
import { classroomPgFallback, classroomRedisCommand, classroomRedisEnabled, classroomRedisKey } from "./redis";
import type { RedisClassroomControl } from "./redis-presence";
const STORE = `local control=redis.call('GET',KEYS[1]);if not control then return 0 end
local c=cjson.decode(control);local version=c.version..':'..((c.versions or {})[ARGV[4]] or '0')
if version ~= ARGV[1] then return 0 end
redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3]);return 1`;
const RELEASE = `if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0`;
/** Short-lived shared reads. Authorization and all mutations always remain in PG. */
export function classroomSharedRead<T>(sessionId: string, scope: string, load: () => Promise<T>): Promise<T> {
  return coalesceClassroomRead(`shared:${sessionId}:${scope}`, async () => {
    if (!classroomRedisEnabled()) return load();
    const topic = scope.includes("courseware") ? "courseware" : scope.split(":")[0];
    const versionOf = (control: RedisClassroomControl) => `${control.version}:${control.versions?.[topic] || "0"}`;
    const controlKey = classroomRedisKey(sessionId, "control");
    const cacheKey = classroomRedisKey(sessionId, `cache:${scope}`);
    const lockKey = classroomRedisKey(sessionId, `cache-lock:${scope}`);
    const read = async () => {
      const values = await classroomRedisCommand(["MGET", controlKey, cacheKey]);
      if (!Array.isArray(values)) return { unavailable: true };
      try {
        const parsed = values[0] ? JSON.parse(String(values[0])) as RedisClassroomControl : null;
        const control = parsed && parsed.verifiedUntil > Date.now() ? parsed : null;
        const cached = values[1] ? JSON.parse(String(values[1])) as { version: string; value: T } : null;
        return { control, hit: Boolean(control && cached && cached.version === versionOf(control)), value: cached?.value };
      } catch { return {}; }
    };
    let result = await read();
    if (result.hit) return result.value as T;
    if (result.unavailable || !result.control) throw Object.assign(new Error("Classroom cache is unavailable"), { code: "P2024" });
    const token = randomUUID();
    const acquired = await classroomRedisCommand(["SET", lockKey, token, "NX", "PX", "5000"]);
    if (acquired !== "OK") {
      // Cold roster construction can exceed 200ms; wait within one bounded
      // request budget rather than starting a second database load.
      const waitUntil = Date.now() + 1_000;
      while (Date.now() < waitUntil) {
        await new Promise(resolve => setTimeout(resolve, 40 + Math.random() * 20));
        result = await read();
        if (result.hit) return result.value as T;
        if (result.unavailable) break;
      }
      throw Object.assign(new Error("Classroom cache rebuild is busy"), { code: "P2024" });
    }
    try {
      const value = await classroomPgFallback(`read:${sessionId}:${scope}`, load);
      await classroomRedisCommand(["EVAL", STORE, "2", controlKey, cacheKey, versionOf(result.control),
        JSON.stringify({ version: versionOf(result.control), value }), "2000", topic]);
      return value;
    } finally { await classroomRedisCommand(["EVAL", RELEASE, "1", lockKey, token]); }
  });
}
