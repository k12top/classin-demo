import assert from "node:assert/strict";
import test from "node:test";
import { mergeCaptionSnapshots, selectLiveCaptions, selectStableCaption } from "../src/lib/classroom/caption-display";
import { unreadChatCount } from "../src/lib/classroom/chat-unread";
import type { ClassroomCaptionSnapshot, ClassroomMessageSnapshot } from "../src/lib/classroom/types";

const now = Date.parse("2026-10-11T04:00:00Z");
const caption = (id: string, secondsAgo: number, speakerId = "teacher", translations = { "en-US": "English", "ja-JP": "日本語" }): ClassroomCaptionSnapshot => ({
  id, speakerId, speakerName: speakerId, text: id, translations, provider: "shengwang", isFinal: true,
  occurredAt: new Date(now - secondsAgo * 1000).toISOString(), createdAt: new Date(now - secondsAgo * 1000).toISOString(), sourceLanguage: "zh-CN", detectedLanguage: "zh-CN",
});

test("late translation delivery and unordered polls do not replace newer speech", () => {
  const old = caption("old", 9), fresh = caption("fresh", 1);
  assert.equal(selectStableCaption([fresh, old], "en-US", "bilingual")?.id, "fresh");
  assert.equal(selectStableCaption([old, { ...fresh, translations: {} }], "en-US", "translated"), null);
  assert.deepEqual(selectLiveCaptions([fresh, old], "en-US", "bilingual", now).map(c => c.id), ["fresh"]);
  assert.deepEqual(selectLiveCaptions([old, { ...fresh, translations: {} }], "en-US", "translated", now), []);
});

test("live captions expire and multiple speakers get separate bounded rows", () => {
  const inputs = [caption("expired", 13, "old"), ...["a", "b", "c", "d"].map((id, index) => caption(id, index, id))];
  assert.deepEqual(selectLiveCaptions(inputs, "en-US", "original", now).map(c => c.id), ["c", "b", "a"]);
  assert.deepEqual(selectLiveCaptions(inputs, "en-US", "off", now), []);
  assert.deepEqual(selectLiveCaptions(inputs, "en-US", "original", now + 13000), []);
});

test("snapshot merging preserves finalized text and the utterance's original time", () => {
  const final = caption("final", 8);
  const delayedPartial = { ...final, text: "f", translations: {}, isFinal: false, occurredAt: new Date(now).toISOString(), createdAt: new Date(now).toISOString() };
  const merged = mergeCaptionSnapshots([final, caption("new", 1)], [delayedPartial]);
  assert.equal(merged[0].text, "final");
  assert.equal(merged[0].occurredAt, final.occurredAt);
  assert.equal(merged[0].isFinal, true);
  assert.equal(merged.at(-1)?.id, "new");
  assert.equal(selectLiveCaptions(merged, "en-US", "bilingual", now + 6000)[0]?.id, "new");
});

test("chat badge only counts unseen incoming messages while closed", () => {
  const messages = ["read", "incoming", "own"].map(id => ({ id, senderId: id === "own" ? "me" : "other" })) as ClassroomMessageSnapshot[];
  const state = { sessionId: "lesson", readIds: ["read"] };
  assert.equal(unreadChatCount(messages, state, "lesson", "me", false), 1);
  assert.equal(unreadChatCount(messages, state, "lesson", "me", true), 0);
  assert.equal(unreadChatCount(messages, { ...state, readIds: messages.map(m => m.id) }, "lesson", "me", false), 0);
  assert.equal(unreadChatCount(messages.slice(1), state, "lesson", "me", false), 1);
  assert.equal(unreadChatCount(messages, state, "new-lesson", "me", false), 0);
});
