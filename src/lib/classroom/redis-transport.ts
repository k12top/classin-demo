/** Bounded Redis transport. Never retries a command whose write may have committed. */
export type RedisReply = string | number | null | RedisReply[];
export interface RedisTransportClient {
  isReady: boolean;
  isOpen: boolean;
  connect(): Promise<unknown>;
  destroy(): void;
  sendCommand(args: string[], options: { abortSignal: AbortSignal }): Promise<unknown>;
}
type Options = {
  createClient: () => RedisTransportClient;
  timeoutMs: () => number;
  log: (event: Record<string, unknown>) => void;
  now?: () => number;
};
export function redisTimeoutMs(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(100, Math.min(3_000, parsed)) : 1_500;
}
function errorKind(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return "timeout";
  return ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN"].includes(code) ? code : "redis_error";
}
async function deadline<T>(work: (signal: AbortSignal) => Promise<T>, ms: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(Object.assign(new Error("Redis deadline exceeded"), { name: "TimeoutError" }));
        controller.abort();
      }, ms);
    })]);
  } finally { clearTimeout(timer); }
}
export class ClassroomRedisTransport {
  private client?: RedisTransportClient;
  private connecting?: Promise<RedisTransportClient>;
  private failedUntil = 0;
  private failures = 0;
  private consecutiveFailures = 0;
  private commands = 0;
  private opens = 0;
  private probing = false;
  private lastWarningAt = -Infinity;
  private readonly now: () => number;
  constructor(private readonly options: Options) { this.now = options.now || Date.now; }
  diagnostics() {
    return { ready: this.client?.isReady === true, circuitOpen: this.failedUntil > this.now(),
      probing: this.probing, failures: this.failures, commands: this.commands, consecutiveFailures: this.consecutiveFailures,
      retryAfterMs: Math.max(0, this.failedUntil - this.now()) };
  }
  private discard(client?: RedisTransportClient) {
    if (client?.isOpen) client.destroy();
    if (this.client === client) this.client = undefined;
  }
  private connected() {
    if (this.client?.isReady) return Promise.resolve(this.client);
    if (this.connecting) return this.connecting;
    this.discard(this.client);
    const client = this.options.createClient();
    this.client = client;
    const pending = deadline(() => client.connect(), this.options.timeoutMs()).then(() => client).catch(error => {
      this.discard(client);
      throw error;
    }).finally(() => { if (this.connecting === pending) this.connecting = undefined; });
    this.connecting = pending;
    return pending;
  }
  async command(args: string[]): Promise<RedisReply | undefined> {
    if (this.failedUntil > this.now() || this.probing) return undefined;
    const probe = this.failedUntil !== 0;
    if (probe) this.probing = true; // Exactly one half-open request per process.
    const startedAt = this.now();
    const timeoutMs = this.options.timeoutMs();
    let client: RedisTransportClient | undefined;
    let phase = "connect";
    try {
      client = await this.connected();
      phase = "command";
      this.commands++;
      const result = await deadline(signal => client!.sendCommand(args, { abortSignal: signal }), timeoutMs) as RedisReply;
      // An older in-flight command cannot close a circuit opened by a newer failure.
      if (client === this.client && (!this.failedUntil || probe)) {
        if (this.consecutiveFailures || this.failedUntil) this.options.log({ event: "recovered", operation: args[0], durationMs: this.now() - startedAt });
        this.consecutiveFailures = 0; this.failedUntil = 0; this.opens = 0;
      }
      return result;
    } catch (error) {
      this.failures++;
      // Ignore failures from a discarded generation; they must not destroy a replacement.
      if (client && client !== this.client) return undefined;
      this.consecutiveFailures++;
      const open = probe || phase === "connect" || this.consecutiveFailures >= 3;
      let retryAfterMs = 0;
      if (open && (probe || !this.failedUntil)) {
        retryAfterMs = Math.min(4_000, 500 * 2 ** Math.min(this.opens++, 3));
        this.failedUntil = this.now() + retryAfterMs;
        this.discard(client || this.client);
      }
      if (open || this.now() - this.lastWarningAt >= 5_000) {
        this.lastWarningAt = this.now();
        // Deliberately omit messages, command arguments, keys and connection URLs.
        this.options.log({ event: open ? "circuit_open" : "command_failed", operation: args[0], phase,
          errorKind: errorKind(error), durationMs: this.now() - startedAt, timeoutMs,
          consecutiveFailures: this.consecutiveFailures, retryAfterMs });
      }
      return undefined;
    } finally { if (probe) this.probing = false; }
  }
  close() {
    this.discard(this.client);
    this.failedUntil = 0; this.consecutiveFailures = 0; this.opens = 0;
  }
}
