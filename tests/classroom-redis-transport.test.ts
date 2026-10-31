import assert from "node:assert/strict";
import test from "node:test";
import { ClassroomRedisTransport, redisTimeoutMs, type RedisTransportClient } from "../src/lib/classroom/redis-transport";
function setup(timeout = 20) {
  let now = 0;
  const logs: Record<string, unknown>[] = [];
  const clients: RedisTransportClient[] = [];
  let operation = async (): Promise<unknown> => "PONG";
  const transport = new ClassroomRedisTransport({ timeoutMs: () => timeout, now: () => now, log: e => logs.push(e), createClient: () => {
    const client: RedisTransportClient = { isOpen: true, isReady: false, async connect() { client.isReady = true; },
      destroy() { client.isOpen = false; client.isReady = false; }, sendCommand: () => operation() };
    clients.push(client); return client;
  } });
  return { transport, logs, clients, advance: (ms: number) => { now += ms; }, set: (next: typeof operation) => { operation = next; } };
}
test("defaults allow 1.5s Redis round trips and reject invalid timeout configuration", () => {
  for (const value of [undefined, "", "NaN", "-1", "0", "Infinity"]) assert.equal(redisTimeoutMs(value), 1500);
  assert.equal(redisTimeoutMs("350"), 350); assert.equal(redisTimeoutMs("9000"), 3000);
});
test("a response slower than the old 350ms budget succeeds without circuit or disconnect", async () => {
  const h = setup(1500); h.set(async () => { await new Promise(r => setTimeout(r, 420)); return "PONG"; });
  assert.equal(await h.transport.command(["PING"]), "PONG"); assert.equal(h.transport.diagnostics().failures, 0);
});
test("one timeout preserves the shared client and next heartbeat recovers immediately", async () => {
  const h = setup(); h.set(() => new Promise(() => {}));
  assert.equal(await h.transport.command(["MGET", "secret-key"]), undefined);
  assert.equal(h.transport.diagnostics().circuitOpen, false); assert.equal(h.clients[0].isOpen, true);
  h.set(async () => "heartbeat-ok"); assert.equal(await h.transport.command(["EVAL", "secret-script"]), "heartbeat-ok");
  assert.equal(h.transport.diagnostics().consecutiveFailures, 0); assert.ok(!JSON.stringify(h.logs).includes("secret"));
  assert.equal(h.logs[0].errorKind, "timeout"); assert.equal(h.logs[0].timeoutMs, 20);
});
test("three failures open a short circuit; only one half-open request probes and then restores service", async () => {
  const h = setup(); h.set(async () => { throw Object.assign(new Error("redis://user:password@host"), { code: "ECONNRESET" }); });
  for (let i = 0; i < 3; i++) await h.transport.command(["PING"]);
  assert.equal(h.transport.diagnostics().retryAfterMs, 500); assert.equal(h.clients[0].isOpen, false);
  const count = h.transport.diagnostics().commands; await h.transport.command(["PING"]); assert.equal(h.transport.diagnostics().commands, count);
  h.advance(501); let release!: (v: string) => void; h.set(() => new Promise(r => { release = r; }));
  const probe = h.transport.command(["PING"]); await new Promise(r => setImmediate(r));
  assert.equal(await h.transport.command(["PING"]), undefined); release("PONG"); assert.equal(await probe, "PONG");
  assert.equal(h.transport.diagnostics().retryAfterMs, 0); h.set(async () => "PONG"); assert.equal(await h.transport.command(["PING"]).then(() => h.transport.diagnostics().circuitOpen), false);
  assert.ok(!JSON.stringify(h.logs).includes("password")); assert.equal(h.logs[0].errorKind, "ECONNRESET");
});
test("a late failure from an old client cannot destroy the recovered generation", async () => {
  const h = setup(1000); let rejectOld!: (e: Error) => void;
  h.set(() => new Promise((_, reject) => { rejectOld = reject; })); const old = h.transport.command(["OLD"]); await new Promise(r => setImmediate(r));
  h.set(async () => { throw new Error("down"); }); for (let i = 0; i < 3; i++) await h.transport.command(["PING"]);
  h.advance(501); h.set(async () => "PONG"); assert.equal(await h.transport.command(["PING"]), "PONG");
  rejectOld(new Error("old socket")); await old;
  assert.equal(h.clients[1].isOpen, true); assert.equal(h.transport.diagnostics().consecutiveFailures, 0);
});
test("repeated outages back off to a bounded 4 seconds", async () => {
  const h = setup(); h.set(async () => { throw new Error("down"); });
  for (let i = 0; i < 3; i++) await h.transport.command(["PING"]);
  for (const expected of [1000, 2000, 4000, 4000]) {
    h.advance(h.transport.diagnostics().retryAfterMs + 1); await h.transport.command(["PING"]);
    assert.equal(h.transport.diagnostics().retryAfterMs, expected);
  }
});
