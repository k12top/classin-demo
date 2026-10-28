import assert from "node:assert/strict";
import test from "node:test";
import { createCaptionPersistenceQueue } from "../src/lib/classroom/caption-persistence";
import type { ClassroomCaptionInput } from "../src/lib/classroom/types";
import { createCaptionOutbox, captionOutboxSessions } from "../src/lib/classroom/caption-outbox";

const unexpected = (error: unknown): never => { throw error; };

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

function caption(update: Partial<ClassroomCaptionInput> = {}): ClassroomCaptionInput {
  return { id: "sentence", speakerId: "speaker", text: "Hello", sourceLanguage: "en-US", detectedLanguage: "en-US", translations: {}, occurredAt: new Date().toISOString(), isFinal: true, ...update };
}

test("rapid partials and multilingual finals coalesce into the latest sentence", async () => {
  const saved: ClassroomCaptionInput[] = [];
  const queue = createCaptionPersistenceQueue(async (value) => { saved.push(value); }, (error) => { throw error; });
  for (let i = 0; i < 50; i++) queue.enqueue(caption({ isFinal: false, text: `partial ${i}` }));
  for (let i = 0; i < 20; i++) {
    queue.enqueue(caption());
    queue.enqueue(caption({ translations: { "zh-CN": "你好" } }));
    queue.enqueue(caption({ translations: { "ja-JP": "こんにちは" } }));
  }
  await queue.flush();
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].translations, { "zh-CN": "你好", "ja-JP": "こんにちは" });
  queue.enqueue(caption());
  queue.enqueue(caption({ translations: { "zh-CN": "你好" } }));
  await queue.flush();
  assert.equal(saved.length, 1);
  queue.enqueue(caption({ translations: { "th-TH": "สวัสดี" } }));
  await queue.flush();
  assert.equal(saved.length, 2);
  assert.deepEqual(saved[1].translations, { "zh-CN": "你好", "ja-JP": "こんにちは", "th-TH": "สวัสดี" });
  queue.dispose();
});

test("slow requests serialize all sentences and retain translations arriving during a write", async () => {
  const saved: ClassroomCaptionInput[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let active = 0;
  let maxActive = 0;
  const queue = createCaptionPersistenceQueue(async (value) => {
    maxActive = Math.max(maxActive, ++active);
    saved.push(value);
    if (saved.length === 1) await gate;
    active--;
  }, (error) => { throw error; });
  queue.enqueue(caption());
  const flush = queue.flush();
  queue.enqueue(caption({ text: "", translations: { "zh-CN": "你好" } }));
  queue.enqueue(caption({ id: "next", text: "Goodbye" }));
  release();
  await flush;
  assert.equal(maxActive, 1);
  assert.equal(saved.length, 3);
  assert.equal(saved[1].text, "Hello");
  assert.equal(saved[1].translations["zh-CN"], "你好");
  assert.equal(saved[2].id, "next");
  queue.dispose();
});

test("disposed instances stop sending and failed captions can be resubmitted", async () => {
  let writes = 0;
  const errors: unknown[] = [];
  const queue = createCaptionPersistenceQueue(async () => { if (++writes === 1) throw new Error("offline"); }, (error) => errors.push(error));
  queue.enqueue(caption());
  await queue.flush();
  assert.equal(errors.length, 1);
  queue.enqueue(caption());
  await queue.flush();
  assert.equal(writes, 2);
  queue.enqueue(caption({ id: "discarded" }));
  queue.dispose();
  queue.enqueue(caption({ id: "also discarded" }));
  await queue.flush();
  assert.equal(writes, 2);
});

test("partial-only speech survives disposal and reload; final status alone triggers another save", async () => {
  const storage = new MemoryStorage();
  const store = createCaptionOutbox(storage, "teacher", "lesson");
  const saved: ClassroomCaptionInput[] = [];
  const first = createCaptionPersistenceQueue(async value => { saved.push(value); }, unexpected, 60_000, { store });
  first.enqueue(caption({ text: "Unfinished speech", isFinal: false }));
  assert.equal(store.read()[0].text, "Unfinished speech", "durable before the debounce or any HTTP call");
  first.dispose();
  const restored = createCaptionPersistenceQueue(async value => { saved.push(value); }, unexpected, 60_000, { store });
  try {
    await restored.flush();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].isFinal, false);
    assert.equal(storage.length, 0);
    restored.enqueue(caption({ text: "Unfinished speech", isFinal: true }));
    await restored.flush();
    assert.equal(saved.length, 2);
    assert.equal(saved[1].isFinal, true);
  } finally { restored.dispose(); }
});

test("a failed send retries with no new provider events and cannot block other sentences", async () => {
  const storage = new MemoryStorage();
  const store = createCaptionOutbox(storage, "teacher", "lesson");
  let fail = true;
  const saved: string[] = [];
  let done!: () => void;
  const recovered = new Promise<void>(resolve => { done = resolve; });
  const queue = createCaptionPersistenceQueue(async value => {
    if (value.id === "sentence" && fail) { fail = false; throw Error("offline"); }
    saved.push(value.id);
    if (value.id === "sentence") done();
  }, () => {}, 60_000, { store, retryMs: 5 });
  try {
    queue.enqueue(caption());
    queue.enqueue(caption({ id: "second" }));
    await queue.flush();
    assert.deepEqual(saved, ["second"]);
    assert.equal(store.read().length, 1);
    await recovered;
    await queue.flush();
    assert.deepEqual(saved, ["second", "sentence"]);
    assert.equal(storage.length, 0);
  } finally { queue.dispose(); }
});

test("an ack in flight cannot erase late translation; another tab can finish it after teardown", async () => {
  const storage = new MemoryStorage();
  const firstStore = createCaptionOutbox(storage, "teacher", "lesson");
  const secondStore = createCaptionOutbox(storage, "teacher", "lesson");
  let release!: () => void;
  const first = createCaptionPersistenceQueue(async () => new Promise<void>(resolve => { release = resolve; }), unexpected, 60_000, { store: firstStore });
  first.enqueue(caption());
  const sending = first.flush();
  secondStore.write(caption({ translations: { "zh-CN": "你好" }, isFinal: false }));
  first.dispose();
  release();
  await sending;
  assert.equal(firstStore.read()[0].translations["zh-CN"], "你好");
  const saved: ClassroomCaptionInput[] = [];
  const resumed = createCaptionPersistenceQueue(async value => { saved.push(value); }, unexpected, 60_000, { store: secondStore });
  try {
    await resumed.flush();
    assert.equal(saved[0].isFinal, true);
    assert.equal(saved[0].translations["zh-CN"], "你好");
    assert.equal(storage.length, 0);
  } finally { resumed.dispose(); }
});

test("outbox replay is scoped to the current account and keeps lessons separate", () => {
  const storage = new MemoryStorage();
  createCaptionOutbox(storage, "teacher-a", "lesson-a").write(caption());
  createCaptionOutbox(storage, "teacher-b", "lesson-b").write(caption());
  assert.deepEqual(captionOutboxSessions(storage, "teacher-a"), ["lesson-a"]);
  assert.deepEqual(createCaptionOutbox(storage, "teacher-a", "lesson-b").read(), []);
  createCaptionOutbox(storage, "teacher-a", "lesson-a").acknowledge(caption());
  assert.deepEqual(captionOutboxSessions(storage, "teacher-b"), ["lesson-b"]);
});

test("independent browser writers keep both translations until a merged version is acknowledged", async () => {
  const storage = new MemoryStorage();
  const a = createCaptionOutbox(storage, "teacher", "lesson", "tab-a");
  const b = createCaptionOutbox(storage, "teacher", "lesson", "tab-b");
  a.write(caption({ translations: { "en-US": "Hello" } }));
  b.write(caption({ translations: { "zh-CN": "你好" } }));
  assert.equal(storage.length, 2);
  const saved: ClassroomCaptionInput[] = [];
  const queue = createCaptionPersistenceQueue(async value => { saved.push(value); }, unexpected, 60_000,
    { store: createCaptionOutbox(storage, "teacher", "lesson") });
  try {
    await queue.flush();
    assert.deepEqual(saved[0].translations, { "en-US": "Hello", "zh-CN": "你好" });
    assert.equal(storage.length, 0);
  } finally { queue.dispose(); }
});

test("a translation written between another tab's ack read and remove cannot be erased", () => {
  class RacingStorage extends MemoryStorage {
    afterRead: (() => void) | null = null;
    getItem(key: string) {
      const value = super.getItem(key);
      const hook = this.afterRead; this.afterRead = null; hook?.();
      return value;
    }
  }
  const storage = new RacingStorage();
  const writer = createCaptionOutbox(storage, "teacher", "lesson", "tab");
  const recovery = createCaptionOutbox(storage, "teacher", "lesson", "recovery");
  writer.write(caption());
  storage.afterRead = () => writer.write(caption({ translations: { "zh-CN": "不能丢" } }));
  recovery.acknowledge(caption());
  assert.equal(recovery.read().length, 1);
  assert.equal(recovery.read()[0].translations["zh-CN"], "不能丢");
});
