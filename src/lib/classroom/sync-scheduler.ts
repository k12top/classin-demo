export type SyncJob = {
  topics: string[];
  run: (signal: AbortSignal) => Promise<unknown>;
  interval: (realtime: boolean) => number | null;
  background?: boolean;
  initialDelay?: number | null;
  wakeAt?: number;
};
type Entry = { job: SyncJob; due: number; running: boolean; dirty: boolean; failures: number; controller: AbortController };
type Clock = { now: () => number; set: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>; clear: (timer: ReturnType<typeof setTimeout>) => void };

/** One scheduling timer per classroom, independent of the number of widgets.
 * Network jobs never overlap themselves. Invalidation during a read queues one
 * follow-up; a slow data read cannot delay the presence lease.
 */
export class ClassroomSyncScheduler {
  private jobs = new Map<symbol, Entry>();
  private timer?: ReturnType<typeof setTimeout>;
  private enabled = false;
  private online = true;
  private visible = true;
  private realtime = false;
  constructor(private clock: Clock = { now: Date.now, set: (fn, ms) => setTimeout(fn, ms), clear: timer => clearTimeout(timer) }) {}

  start() { this.enabled = true; this.arm(); }
  stop() {
    this.enabled = false;
    if (this.timer !== undefined) this.clock.clear(this.timer);
    this.timer = undefined;
    for (const entry of this.jobs.values()) entry.controller.abort();
    this.jobs.clear();
  }
  register(job: SyncJob) {
    const id = Symbol(), entry: Entry = { job, due: job.initialDelay === null ? Infinity : this.clock.now() + (job.initialDelay ?? 50), running: false, dirty: false, failures: 0, controller: new AbortController() };
    this.jobs.set(id, entry); this.arm();
    return () => { entry.controller.abort(); this.jobs.delete(id); this.arm(); };
  }
  setRealtime(ready: boolean) {
    if (ready === this.realtime) return;
    this.realtime = ready;
    // Preserve an earlier lease deadline; immediately repair after link changes.
    this.invalidate("transport");
  }
  environment(online: boolean, visible: boolean, resume = false) {
    const recovered = (!this.online && online) || (!this.visible && visible);
    this.online = online; this.visible = visible;
    if (online && visible && (recovered || resume)) {
      for (const entry of this.jobs.values()) entry.failures = 0;
      this.invalidate("*");
    }
    else this.arm();
  }
  invalidate(topic: string) {
    for (const entry of this.jobs.values()) {
      if (topic !== "*" && !entry.job.topics.includes(topic)) continue;
      if (entry.running) entry.dirty = true;
      else if (entry.failures && entry.due > this.clock.now()) continue;
      else entry.due = Math.min(entry.due, this.clock.now() + 50);
    }
    this.arm();
  }
  private eligible(entry: Entry) { return this.online && (this.visible || entry.job.background); }
  private arm() {
    if (this.timer !== undefined) this.clock.clear(this.timer);
    this.timer = undefined;
    if (!this.enabled) return;
    const next = Math.min(Infinity, ...[...this.jobs.values()].filter(entry => !entry.running && this.eligible(entry)).map(entry => entry.due));
    if (Number.isFinite(next)) this.timer = this.clock.set(() => { this.timer = undefined; this.tick(); }, Math.max(0, next - this.clock.now()));
  }
  private tick() {
    for (const [id, entry] of this.jobs) {
      if (entry.running || !this.eligible(entry) || entry.due > this.clock.now()) continue;
      entry.running = true; entry.dirty = false;
      void Promise.resolve().then(() => entry.controller.signal.throwIfAborted()).then(() => entry.job.run(entry.controller.signal)).then(
        () => { entry.failures = 0; }, () => { entry.failures++; },
      ).finally(() => {
        if (!this.enabled || this.jobs.get(id) !== entry) return;
        entry.running = false;
        const interval = entry.job.interval(this.realtime);
        const delay = entry.failures ? Math.min(60_000, Math.max(5_000, interval ?? 5_000) * 2 ** Math.min(entry.failures - 1, 4)) : interval;
        entry.due = entry.dirty && !entry.failures ? this.clock.now() + 50 : delay === null ? Infinity : this.clock.now() + delay;
        if (!entry.failures && entry.job.wakeAt && entry.job.wakeAt > this.clock.now()) entry.due = Math.min(entry.due, entry.job.wakeAt);
        this.arm();
      });
    }
    this.arm();
  }
}

/** Share only in-flight authorized GETs, never cached data across mutations.
 * Each consumer cancels independently; the underlying read stops when all leave.
 */
export class ClassroomSharedReads {
  private reads = new Map<string, { controller: AbortController; promise: Promise<unknown>; users: number }>();
  read<T>(key: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal | null): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    let entry = this.reads.get(key);
    if (!entry) {
      const controller = new AbortController();
      const created = { controller, users: 0, promise: Promise.resolve().then(() => { controller.signal.throwIfAborted(); return load(controller.signal); }) };
      entry = created; this.reads.set(key, created);
      void created.promise.then(() => this.finish(key, created), () => this.finish(key, created));
    }
    const current = entry; current.users++;
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done) return false;
        done = true; signal?.removeEventListener("abort", abort);
        if (--current.users === 0 && this.reads.get(key) === current) { this.reads.delete(key); current.controller.abort(); }
        return true;
      };
      const abort = () => { if (finish()) reject(signal?.reason); };
      signal?.addEventListener("abort", abort, { once: true });
      current.promise.then(value => { if (finish()) resolve(value as T); }, error => { if (finish()) reject(error); });
    });
  }
  private finish(key: string, entry: unknown) { if (this.reads.get(key) === entry) this.reads.delete(key); }
  stop() { for (const entry of this.reads.values()) entry.controller.abort(); this.reads.clear(); }
}
