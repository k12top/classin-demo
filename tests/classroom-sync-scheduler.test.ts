import assert from "node:assert/strict";
import test from "node:test";
import { ClassroomSharedReads, ClassroomSyncScheduler } from "../src/lib/classroom/sync-scheduler";

function fixture() {
  let now = 0, id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const scheduler = new ClassroomSyncScheduler({ now: () => now,
    set: (fn, ms) => { const key = ++id; timers.set(key, { at: now + ms, fn }); return key as unknown as ReturnType<typeof setTimeout>; },
    clear: timer => { timers.delete(timer as unknown as number); },
  });
  const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn(); await settle();
    }
    now = end; await settle();
  };
  scheduler.start();
  return { scheduler, advance, settle, get timers() { return timers.size; } };
}

test("many widgets share one scheduling timer; realtime uses slow recovery and loss restores fast polling", async () => {
  const f = fixture();let reads = 0;
  for (let i = 0; i < 30; i++) f.scheduler.register({ topics: ["activities", "transport"], interval: ready => ready ? 60_000 : 5_000, run: async () => { reads++; } });
  f.scheduler.setRealtime(true);assert.equal(f.timers, 1);
  await f.advance(50);assert.equal(reads, 30);await f.advance(59_000);assert.equal(reads, 30);
  f.scheduler.setRealtime(false);await f.advance(50);assert.equal(reads, 60);
  await f.advance(5_000);assert.equal(reads, 90);assert.equal(f.timers, 1);f.scheduler.stop();assert.equal(f.timers, 0);
});

test("notification bursts coalesce and an in-flight read queues only one follow-up", async () => {
  const f = fixture();let reads = 0, release: (() => void) | undefined;
  f.scheduler.register({ topics: ["captions"], interval: () => null, initialDelay: null, run: async () => { reads++;if (reads === 1) await new Promise<void>(resolve => { release = resolve; }); } });
  for (let i = 0; i < 100; i++) f.scheduler.invalidate("captions");
  await f.advance(50);assert.equal(reads, 1);
  for (let i = 0; i < 100; i++) f.scheduler.invalidate("captions");
  await f.advance(20_000);assert.equal(reads, 1);release!();await f.settle();await f.advance(50);assert.equal(reads, 2);
  await f.advance(60_000);assert.equal(reads, 2);f.scheduler.stop();
});

test("hidden pages keep only presence alive; offline suspends all network jobs and return repairs once", async () => {
  const f = fixture();let leases = 0, reads = 0;
  f.scheduler.register({ topics: ["presence"], background: true, interval: () => 15_000, run: async () => { leases++; } });
  f.scheduler.register({ topics: ["activities"], interval: () => 5_000, run: async () => { reads++; } });
  f.scheduler.environment(true, false);await f.advance(45_050);assert.equal(leases, 4);assert.equal(reads, 0);
  f.scheduler.environment(false, false);await f.advance(60_000);assert.equal(leases, 4);assert.equal(f.timers, 0);
  f.scheduler.environment(true, true);await f.advance(50);assert.equal(leases, 5);assert.equal(reads, 1);f.scheduler.stop();
});

test("slow data does not block the lease, failures back off and unmount aborts work", async () => {
  const f = fixture();let leases = 0, failures = 0;let signal: AbortSignal | undefined;
  const remove = f.scheduler.register({ topics: ["slow"], interval: () => 5_000, run: async current => { signal = current;await new Promise<void>(() => {}); } });
  f.scheduler.register({ topics: ["presence"], background: true, interval: () => 15_000, run: async () => { leases++; } });
  f.scheduler.register({ topics: ["bad"], interval: () => null, run: async () => { failures++;throw new Error("offline"); } });
  await f.advance(50);assert.equal(failures, 1);await f.advance(15_000);assert.equal(leases, 2);assert.equal(failures, 3);
  remove();assert.equal(signal?.aborted, true);f.scheduler.stop();assert.equal(f.timers, 0);
});

test("transport changes never run credential recovery or create a reconnection loop", async () => {
  const f = fixture();let resumes = 0;
  f.scheduler.register({ topics: ["resume"], interval: () => null, initialDelay: null, run: async () => { resumes++;f.scheduler.setRealtime(true); } });
  f.scheduler.setRealtime(false);f.scheduler.setRealtime(true);await f.advance(60_000);assert.equal(resumes, 0);
  f.scheduler.environment(true, true, true);await f.advance(50);assert.equal(resumes, 1);await f.advance(60_000);assert.equal(resumes, 1);f.scheduler.stop();
});

test("activity deadlines wake an otherwise quiet realtime connection at the deadline", async () => {
  const f = fixture();let reads = 0;
  f.scheduler.setRealtime(true);
  f.scheduler.register({ topics: ["activities"], wakeAt: 10_000, interval: () => 60_000, run: async () => { reads++; } });
  await f.advance(50);assert.equal(reads, 1);await f.advance(9_950);assert.equal(reads, 2);
  await f.advance(30_000);assert.equal(reads, 2);f.scheduler.stop();
});

test("a stream of notifications cannot bypass failed-request backoff", async () => {
  const f = fixture();let reads = 0;
  f.scheduler.register({ topics: ["captions"], interval: () => null, run: async () => { reads++;throw new Error("503"); } });
  await f.advance(50);assert.equal(reads, 1);
  for (let i = 0; i < 100; i++) f.scheduler.invalidate("captions");
  await f.advance(4_000);assert.equal(reads, 1);
  await f.advance(1_000);assert.equal(reads, 2);f.scheduler.stop();
});

test("shared GET consumers cancel independently, requests are never cached across changes", async () => {
  const reads = new ClassroomSharedReads();let calls = 0, release!: (value: number) => void;let underlying: AbortSignal | undefined;
  const load = (signal: AbortSignal) => { calls++;underlying = signal;return new Promise<number>(resolve => { release = resolve; }); };
  const a = new AbortController(), b = new AbortController();
  const first = reads.read("authorized-url", load, a.signal), second = reads.read("authorized-url", load, b.signal);
  await Promise.resolve();assert.equal(calls, 1);a.abort();await assert.rejects(first);assert.equal(underlying?.aborted, false);
  release(7);assert.equal(await second, 7);
  const next = reads.read("authorized-url", load);await Promise.resolve();assert.equal(calls, 2);release(8);assert.equal(await next, 8);
  const c = new AbortController();const last = reads.read("another-url", load, c.signal);await Promise.resolve();c.abort();await assert.rejects(last);assert.equal(underlying?.aborted, true);
  reads.stop();
});
