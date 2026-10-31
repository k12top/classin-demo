import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";
import { createCaptionSyncState } from "../src/lib/classroom/caption-sync";
import { mergeCaptionSnapshots } from "../src/lib/classroom/caption-display";
import type { ClassroomCaptionSnapshot } from "../src/lib/classroom/types";

const { classroomCaptionDelta: delta } = loadModule<typeof import("../src/lib/classroom/server/caption-delta")>(
  "src/lib/classroom/server/caption-delta.ts", { "server-only": {} });
const caption = (id: string, update: Partial<ClassroomCaptionSnapshot> = {}): ClassroomCaptionSnapshot => ({
  id, provider: "shengwang", speakerId: "teacher", speakerName: "Teacher", text: `原文 ${id}`, sourceLanguage: "zh-CN", detectedLanguage: "zh-CN",
  occurredAt: "2026-10-31T00:00:00.000Z", createdAt: "2026-10-31T00:00:00.000Z", updatedAt: "2026-10-31T00:00:00.000Z",
  isFinal: true, translations: {}, ...update,
});

test("first read is a bounded snapshot; unchanged reads contain no history or redundant cursor", () => {
  const history = Array.from({ length: 100 }, (_, i) => caption(String(i)));
  const initial = delta("lesson", history);
  assert.equal(initial.captionSync.mode, "snapshot");assert.equal(initial.captions.length, 100);
  assert.ok(initial.captionSync.cursor!.length < 3300);
  assert.deepEqual(delta("lesson", history, initial.captionSync.cursor), { captions: [], captionSync: { mode: "delta" } });
  assert.equal(delta("lesson", [...history, caption("latest")]).captions.length, 100);
});

test("a single new caption, late translation, text correction and status-only update are deltas", () => {
  const history = [caption("first"), caption("second")];
  const initial = delta("lesson", history);
  for (const changed of [
    [...history, caption("third")],
    [{ ...history[0], translations: { "en-US": "Late translation" } }, history[1]],
    [{ ...history[0], text: "更正后的原文" }, history[1]],
    [{ ...history[0], translationStatus: "failed" as const }, history[1]],
  ]) {
    const result = delta("lesson", changed, initial.captionSync.cursor);
    assert.equal(result.captions.length, 1);assert.equal(result.captionSync.mode, "delta");
    assert.deepEqual(delta("lesson", changed, result.captionSync.cursor).captions, []);
  }
  const partial = caption("partial", { isFinal: false });
  const baseline = delta("lesson", [partial]);
  assert.equal(delta("lesson", [{ ...partial, isFinal: true }], baseline.captionSync.cursor).captions[0].isFinal, true);
});

test("equal timestamps, reordered objects and long disconnects never rely on a timestamp watermark", () => {
  const first = caption("first", { translations: { "en-US": "Hello", "fr-FR": "Bonjour" } });
  const cursor = delta("lesson", [first]).captionSync.cursor;
  assert.equal(delta("lesson", [first, caption("second")], cursor).captions[0].id, "second");
  assert.deepEqual(delta("lesson", [{ ...first, translations: { "fr-FR": "Bonjour", "en-US": "Hello" } }], cursor).captions, []);
  const latest = Array.from({ length: 100 }, (_, i) => caption(`later-${i}`));
  assert.equal(delta("lesson", latest, cursor).captions.length, 100);
  for (const invalid of ["bad", "a".repeat(20_000), "!not-base64", delta("other-lesson", [first]).captionSync.cursor]) {
    const result = delta("lesson", [first], invalid);
    assert.equal(result.captionSync.mode, "snapshot");assert.deepEqual(result.captions, [first]);
  }
});

test("client uses only merged HTTP replies, tolerates old servers and ignores replies from another context", () => {
  const client = createCaptionSyncState();let current: ClassroomCaptionSnapshot[] = [];
  const merge = (items: ClassroomCaptionSnapshot[]) => { current = mergeCaptionSnapshots(current, items); };
  const query = () => { const params = new URLSearchParams();client.query("lesson:viewer", params);return params; };
  assert.equal(query().has("captionCursor"), false);
  const snapshot = delta("lesson", [caption("one")]);client.accept("lesson:viewer", snapshot, merge);
  assert.equal(query().get("captionCursor"), snapshot.captionSync.cursor);
  const changed = caption("one", { translations: { "en-US": "Translated" }, updatedAt: "2026-10-31T00:00:01.000Z" });
  const update = delta("lesson", [changed], snapshot.captionSync.cursor);client.accept("lesson:viewer", update, merge);
  client.accept("lesson:viewer", delta("lesson", [changed], update.captionSync.cursor), merge);
  assert.deepEqual(current, [changed]);assert.equal(query().get("captionCursor"), update.captionSync.cursor);
  client.query("other:viewer", new URLSearchParams());client.accept("lesson:viewer", snapshot, () => assert.fail("old context"));
  assert.equal(query().has("captionCursor"), false);
  client.accept("lesson:viewer", snapshot, merge);client.accept("lesson:viewer", { captions: [changed] }, merge);
  assert.equal(query().has("captionCursor"), false);
  client.accept("lesson:viewer", snapshot, merge);client.reset();assert.equal(query().has("captionCursor"), false);
});

test("reordered replies repair their cursor on the next read without rolling a final or translation back", () => {
  const client = createCaptionSyncState();const query = new URLSearchParams();client.query("lesson", query);
  let current = [caption("one")];const merge = (items: ClassroomCaptionSnapshot[]) => { current = mergeCaptionSnapshots(current, items); };
  const original = delta("lesson", current);
  const latest = delta("lesson", [caption("one", { text: "Corrected", updatedAt: "2026-10-31T00:00:02.000Z", translations: { "en-US": "Correct" } })]);
  client.accept("lesson", latest, merge);client.accept("lesson", original, merge);
  client.query("lesson", query);const repair = delta("lesson", latest.captions, query.get("captionCursor"));client.accept("lesson", repair, merge);
  assert.deepEqual(current, latest.captions);
  client.query("lesson", query);assert.deepEqual(delta("lesson", current, query.get("captionCursor")).captions, []);
});

test("100-caption bilingual fixture reduces total request-cursor plus response bytes for a one-row update", () => {
  const history = Array.from({ length: 100 }, (_, i) => caption(String(i), { text: "这是一句课堂讲解内容。".repeat(8), translations: { "en-US": "This is an explanation in the classroom. ".repeat(8) } }));
  const first = delta("lesson", history);const update = delta("lesson", [...history.slice(1), caption("new")], first.captionSync.cursor);
  const fullBytes = Buffer.byteLength(JSON.stringify({ captions: history }));
  const deltaBytes = Buffer.byteLength(first.captionSync.cursor!) + Buffer.byteLength(JSON.stringify(update));
  assert.ok(deltaBytes < fullBytes * 0.15, `${deltaBytes} / ${fullBytes}`);
});
