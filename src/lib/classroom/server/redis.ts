import "server-only";
import { createClient } from "redis";

export type RedisReply = string | number | null | RedisReply[];
function createClassroomRedisClient() {
  return createClient({ url: (process.env.CLASSROOM_REDIS_URL || process.env.REDIS_URL)!.trim(), RESP: 2,
    socket: { connectTimeout: 500, reconnectStrategy: false }, disableOfflineQueue: true, commandsQueueMaxLength: 256 });
}
type Client = ReturnType<typeof createClassroomRedisClient>;
const state = globalThis as typeof globalThis & { classroomRedis?: {
  client?: Client; connecting?: Promise<Client>; failedUntil: number; failures: number; commands: number;
} };
const redis = state.classroomRedis ??= { failedUntil: 0, failures: 0, commands: 0 };
export function classroomRedisEnabled() { return Boolean((process.env.CLASSROOM_REDIS_URL || process.env.REDIS_URL)?.trim()); }
export function classroomRedisKey(sessionId: string, suffix: string) {
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
  const prefix = process.env.CLASSROOM_REDIS_PREFIX?.trim() || `classroom:${environment}:v1`;
  return `${prefix}:{${sessionId}}:${suffix}`;
}
export function classroomRedisDiagnostics() {
  return { configured: classroomRedisEnabled(), ready: redis.client?.isReady === true,
    circuitOpen: redis.failedUntil > Date.now(), failures: redis.failures, commands: redis.commands };
}
function failed(operation: string) {
  redis.failures++;
  if (redis.failedUntil <= Date.now()) console.warn("[classroom:redis]", { event: "unavailable", operation, retryAfterMs: 10_000 });
  redis.failedUntil = Date.now() + 10_000;
  if (redis.client?.isOpen) redis.client.destroy();
  redis.client = undefined;
}
async function deadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Redis response timeout")), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
async function connected(): Promise<Client> {
  if (redis.client?.isReady) return redis.client;
  if (redis.connecting) return redis.connecting;
  const client = createClassroomRedisClient();
  client.on("error", () => { /* Commands report sanitized errors and open the circuit. */ });
  redis.client = client;
  const pending = deadline(client.connect(), 500).then(() => {
    if (redis.failures) console.info("[classroom:redis]", { event: "recovered" });
    return client;
  }).finally(() => { if (redis.connecting === pending) redis.connecting = undefined; });
  redis.connecting = pending;
  return pending;
}
/** Undefined means unavailable/disabled; null is a successful Redis cache miss. */
export async function classroomRedisCommand(args: string[]): Promise<RedisReply | undefined> {
  if (!classroomRedisEnabled() || redis.failedUntil > Date.now()) return undefined;
  try {
    const client = await connected();
    const timeout = Math.max(100, Math.min(2_000, Number(process.env.CLASSROOM_REDIS_TIMEOUT_MS) || 350));
    redis.commands++;
    // node-redis cancels queued commands only; bound the response after send too.
    return await deadline(client.sendCommand(args, { abortSignal: AbortSignal.timeout(timeout) }), timeout) as RedisReply;
  } catch { failed(args[0]); return undefined; }
}
export async function closeClassroomRedis() {
  if (redis.client?.isOpen) redis.client.destroy();
  redis.client = undefined; redis.failedUntil = 0;
}

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
        throw Object.assign(new Error("Classroom fallback capacity exhausted"), { code: "P2024" });
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    activeFallbacks++;
    try { return await operation(); } finally { activeFallbacks--; }
  })().finally(() => { if (pendingFallbacks.get(key) === work) pendingFallbacks.delete(key); });
  pendingFallbacks.set(key, work);
  return work;
}
