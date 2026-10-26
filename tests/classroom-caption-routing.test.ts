import assert from "node:assert/strict";
import test from "node:test";
import { planCaptionTranslations, requestedBridgeTargets } from "../src/lib/classroom/caption-routing";
import { captionLanguageSelectOptions, normalizeTargetLanguages } from "../src/lib/classroom/languages";
import { loadModule } from "./helpers/load-module";

const bridge = { configured: true, targetLanguages: ["en-US", "am-ET", "bm", "chm"], maxTargetLanguages: 2 };

test("default routing prioritizes Shengwang including Amharic; only extra languages use the bridge", () => {
  const plan = planCaptionTranslations("shengwang", "zh-CN", ["zh-CN", "am-ET", "en-US", "bm", "chm", "bm"], bridge);
  assert.deepEqual(plan, { shengwangTargets: ["am-ET", "en-US"], wordlyTargets: ["bm", "chm"], unsupportedTargets: [], exceedsLimit: false });
  assert.deepEqual(requestedBridgeTargets("shengwang", "zh-CN", ["am-ET", "bm"]), ["bm"]);
});

test("unavailable bridge and unsupported tracks fail closed, while explicit legacy Wordly remains pinned", () => {
  assert.deepEqual(planCaptionTranslations("shengwang", "zh-CN", ["xx-XX", "bm"], { ...bridge, configured: false }).unsupportedTargets, ["xx-XX", "bm"]);
  const pinned = planCaptionTranslations("wordly", "zh-CN", ["en-US", "am-ET", "bm"], bridge);
  assert.deepEqual(pinned.shengwangTargets, []);
  assert.equal(pinned.exceedsLimit, true);
  assert.deepEqual(pinned.wordlyTargets, ["en-US", "am-ET", "bm"]);
});

test("discovered subtitle languages survive normalization and have searchable localized names", () => {
  assert.deepEqual(normalizeTargetLanguages(["bm", "chm", "invalid", "zh-CN"], "zh-CN"), ["bm", "chm"]);
  const choices = captionLanguageSelectOptions("shengwang", "zh-CN", ["am-ET", "bm", "chm"]);
  const amharic = choices.find(value => value.value === "am-ET")!;
  assert.match(amharic.label, /አማርኛ/);
  assert.match(amharic.searchText, /Amharic/);
  assert.match(amharic.searchText, /埃塞俄比亚/);
  assert.equal(choices.length, 3);
});

function bridgeClient(fetch: typeof globalThis.fetch) {
  return loadModule<typeof import("../src/lib/classroom/translation/wordly")>("src/lib/classroom/translation/wordly.ts", { "server-only": {} }, {
    fetch, process: { env: { WORDLY_API_URL: "https://bridge.example", WORDLY_INTERNAL_TOKEN: "fixture-secret" } },
  });
}

test("bridge capability discovery uses bearer auth, coalesces concurrent calls, and validates the response", async () => {
  let calls = 0;
  const client = bridgeClient(async (url, options) => {
    calls++;
    assert.equal(url, "https://bridge.example/api/v1/bridge/capabilities");
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer fixture-secret");
    return Response.json({ configured: true, targetLanguages: ["bm", "chm", "bm", "invalid", 42], maxTargetLanguages: 10 });
  });
  const results = await Promise.all([client.wordlyTranslationCapabilities(), client.wordlyTranslationCapabilities()]);
  assert.deepEqual(results[0], { configured: true, targetLanguages: ["bm", "chm"], maxTargetLanguages: 10 });
  assert.deepEqual(results[0], results[1]);
  await client.wordlyTranslationCapabilities();
  assert.equal(calls, 1);
});

test("a healthy-looking or failing bridge never invents language support", async () => {
  for (const response of [Response.json({ status: "ok" }), new Response("denied", { status: 401 })]) {
    const client = bridgeClient(async () => response);
    assert.deepEqual(await client.wordlyTranslationCapabilities(), { configured: false, targetLanguages: [], maxTargetLanguages: 0 });
  }
  const client = bridgeClient(async () => { throw new Error("timeout"); });
  assert.equal((await client.wordlyTranslationCapabilities()).configured, false);
});

test("mixed captions send a translation-free transcript so the bridge performs the missing work", async () => {
  const client = bridgeClient(async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.deepEqual(body.translations, {});
    assert.equal(body.text, "Hello");
    return Response.json({ translations: { bm: "Translated" } });
  });
  const result = await client.translateCaptionWithWordly("session", { id: "caption", text: "Hello", sourceLanguage: "en-US", detectedLanguage: "en-US", speakerId: "teacher", isFinal: true, occurredAt: new Date().toISOString(), translations: { "am-ET": "ሰላም" } });
  assert.equal(result.translations?.bm, "Translated");
});
