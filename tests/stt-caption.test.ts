import assert from "node:assert/strict";
import test from "node:test";
import { decodeClassroomSttCaption } from "../src/lib/classroom/stt-caption";
import { shouldReusePersistedCaption } from "../src/lib/classroom/caption-idempotency";
import {
  buildAgoraSttJoinPayload,
  buildAgoraSttUpdatePayload,
} from "../src/lib/classroom/transcription/agora-stt-payload";

test("decodes Shengwang-compatible JSON caption payloads", () => {
  const payload = new TextEncoder().encode(
    JSON.stringify({
      uid: "1001",
      sentenceId: "42",
      textTs: 1_800_000_000_000,
      culture: "th-TH",
      words: [{ text: "สวัสดี", isFinal: true }],
      trans: [
        { lang: "en-US", texts: ["Hello"], isFinal: true },
        { lang: "zh-CN", texts: ["你好"], isFinal: true },
      ],
    }),
  );
  const caption = decodeClassroomSttCaption(payload);
  assert.ok(caption);
  assert.equal(caption.text, "สวัสดี");
  assert.equal(caption.sourceLanguage, "th-TH");
  assert.equal(caption.translations["en-US"], "Hello");
  assert.equal(caption.translations["zh-CN"], "你好");
  assert.equal(caption.isFinal, true);
  assert.match(caption.id, /^stt_42_1001_/);
});

test("ignores malformed caption payloads", () => {
  assert.equal(decodeClassroomSttCaption(new Uint8Array([0xff, 0x00])), null);
});

test("deduplicates final captions before calling Wordly", () => {
  const base = {
    existingIsFinal: true,
    existingText: "hello",
    existingTranslations: { "th-TH": "สวัสดี" },
    incomingIsFinal: true,
    incomingText: "hello",
    incomingTranslations: {},
    provider: "wordly" as const,
    targetLanguages: ["th-TH"],
  };
  assert.equal(shouldReusePersistedCaption(base), true);
  assert.equal(
    shouldReusePersistedCaption({
      ...base,
      existingTranslations: {},
    }),
    false,
  );
  assert.equal(
    shouldReusePersistedCaption({
      ...base,
      incomingText: "hello!",
    }),
    false,
  );
  assert.equal(
    shouldReusePersistedCaption({
      ...base,
      incomingIsFinal: false,
    }),
    true,
  );
});

test("accepts a later Shengwang translation for the same final sentence", () => {
  assert.equal(
    shouldReusePersistedCaption({
      existingIsFinal: true,
      existingText: "hello",
      existingTranslations: {},
      incomingIsFinal: true,
      incomingText: "hello",
      incomingTranslations: { "th-TH": "สวัสดี" },
      provider: "shengwang",
      targetLanguages: ["th-TH"],
    }),
    false,
  );
});

test("builds Shengwang join and update translation parameters safely", () => {
  const targets = Array.from({ length: 12 }, (_, index) => `lang-${index}`);
  const join = buildAgoraSttJoinPayload({
    channelName: "room",
    sourceLanguage: "zh-CN",
    targetLanguages: targets,
    translationProvider: "shengwang",
    maxIdleSeconds: 300,
    subscriberUid: "1",
    subscriberToken: "sub-token",
    publisherUid: "2",
    publisherToken: "pub-token",
    taskName: "classroom-test",
  }) as {
    translateConfig: { enable: boolean; languages: Array<{ target: string[] }> };
  };
  assert.equal(join.translateConfig.enable, true);
  assert.equal(join.translateConfig.languages[0].target.length, 10);

  const wordlyUpdate = buildAgoraSttUpdatePayload({
    sourceLanguage: "zh-CN",
    targetLanguages: ["th-TH"],
    translationProvider: "wordly",
  });
  assert.equal(wordlyUpdate.translateConfig.enable, false);
  assert.deepEqual(wordlyUpdate.translateConfig.languages, []);
});
