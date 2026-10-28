import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";
import { captionContains } from "../src/lib/classroom/caption-outbox";
import type { ClassroomCaptionInput } from "../src/lib/classroom/types";

const caption: ClassroomCaptionInput = { id: "sentence", text: "Hello", speakerId: "teacher", sourceLanguage: "en-US", detectedLanguage: "en-US", translations: { "zh-CN": "你好" }, isFinal: true, occurredAt: new Date().toISOString() };
function fixture(responses: { status?: number; body: unknown }[]) {
  let calls = 0, refreshes = 0;
  const api = loadModule<typeof import("../src/lib/classroom/caption-delivery")>("src/lib/classroom/caption-delivery.ts", {
    "../auth-refresh-client": { tryOAuthRefresh: async () => { refreshes++; return true; } },
    "./caption-outbox": { captionContains },
  }, {
    fetch: async (_url: string, init: RequestInit) => {
      assert.equal(init.credentials, "same-origin");
      const response = responses[calls++];
      return Response.json(response.body, { status: response.status ?? 200 });
    },
  });
  return { api, get calls() { return calls; }, get refreshes() { return refreshes; } };
}

test("expired login refreshes once and retries the same archived caption", async () => {
  const f = fixture([{ status: 401, body: { error: "expired" } }, { body: { caption, revision: 2 } }]);
  assert.equal((await f.api.deliverClassroomCaption("lesson", caption)).revision, 2);
  assert.equal(f.calls, 2); assert.equal(f.refreshes, 1);
});

test("HTTP success without confirmed content never acknowledges a caption", async () => {
  for (const body of [{ ignored: true }, { caption: { ...caption, id: "other" } }, { caption: { ...caption, translations: {} } }, { caption: { ...caption, isFinal: false } }]) {
    const f = fixture([{ body }]);
    await assert.rejects(f.api.deliverClassroomCaption("lesson", caption), /not acknowledged/);
  }
});

test("recorder authorization does not use the human OAuth refresh path", async () => {
  const f = fixture([{ status: 401, body: { error: "expired recorder token" } }]);
  await assert.rejects(f.api.deliverClassroomCaption("lesson", caption, { recorderToken: "recorder-token" }), /not acknowledged/);
  assert.equal(f.refreshes, 0); assert.equal(f.calls, 1);
});
