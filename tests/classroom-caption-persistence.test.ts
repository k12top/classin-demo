import assert from "node:assert/strict";
import test from "node:test";
import { createCaptionPersistenceQueue } from "../src/lib/classroom/caption-persistence";
import type { ClassroomCaptionInput } from "../src/lib/classroom/types";

function caption(update: Partial<ClassroomCaptionInput> = {}): ClassroomCaptionInput {
  return { id: "sentence", speakerId: "speaker", text: "Hello", sourceLanguage: "en-US", detectedLanguage: "en-US", translations: {}, occurredAt: new Date().toISOString(), isFinal: true, ...update };
}

test("partial events stay local and repeated multilingual finals coalesce into one write", async () => {
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

test("leaving discards pending writes, and failed captions can be resubmitted", async () => {
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
