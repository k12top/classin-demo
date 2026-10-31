import "server-only";
import { createClient } from "redis";
import { ClassroomRedisTransport, redisTimeoutMs, type RedisReply } from "../redis-transport";
import { ClassroomCacheUnavailableError } from "../cache-error";
export type { RedisReply } from "../redis-transport";
const timeoutMs = () => redisTimeoutMs(process.env.CLASSROOM_REDIS_TIMEOUT_MS);
function createClassroomRedisClient() {
  const client = createClient({ url: (process.env.CLASSROOM_REDIS_URL || process.env.REDIS_URL)!.trim(), RESP: 2,
    socket: { connectTimeout: timeoutMs(), reconnectStrategy: false }, disableOfflineQueue: true, commandsQueueMaxLength: 256 });
  client.on("error", () => { /* Command failures are classified and logged without credentials. */ });
  return client;
}
const state = globalThis as typeof globalThis & { classroomRedisTransport?: ClassroomRedisTransport };
const transport = state.classroomRedisTransport ??= new ClassroomRedisTransport({ createClient: createClassroomRedisClient,
  timeoutMs, log: event => {
    const context = { ...event, region: process.env.VERCEL_REGION || "unknown" };
    if (event.event === "recovered") console.info("[classroom:redis]", context);
    else console.warn("[classroom:redis]", context);
  } });
export function classroomRedisEnabled() { return Boolean((process.env.CLASSROOM_REDIS_URL || process.env.REDIS_URL)?.trim()); }
export function classroomRedisKey(sessionId: string, suffix: string) {
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
  const prefix = process.env.CLASSROOM_REDIS_PREFIX?.trim() || `classroom:${environment}:v1`;
  return `${prefix}:{${sessionId}}:${suffix}`;
}
export function classroomRedisDiagnostics() { return { configured: classroomRedisEnabled(), ...transport.diagnostics() }; }
/** Undefined means unavailable/disabled; null is a successful Redis cache miss. */
export async function classroomRedisCommand(args: string[]): Promise<RedisReply | undefined> {
  return classroomRedisEnabled() ? transport.command(args) : undefined;
}
export async function closeClassroomRedis() { transport.close(); }

let activeFallbacks = 0;
const pendingFallbacks = new Map<string, Promise<unknown>>();
/** Bound per-instance PG fallback pressure; never replace a failed read with an empty roster. */
export function classroomPgFallback<T>(key: string, operation: () => Promise<T>): Promise<T> {
  if (!classroomRedisEnabled()) return operation();
  const pending = pendingFallbacks.get(key);
  if (pending) return pending as Promise<T>;
  const work = (async () => {
    const deadline = Date.now() + 500;
    while (activeFallbacks >= 2) {
      if (Date.now() >= deadline || pendingFallbacks.size > 64) {
        throw new ClassroomCacheUnavailableError("fallback_capacity");
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    activeFallbacks++;
    try { return await operation(); } finally { activeFallbacks--; }
  })().finally(() => { if (pendingFallbacks.get(key) === work) pendingFallbacks.delete(key); });
  pendingFallbacks.set(key, work);
  return work;
}
