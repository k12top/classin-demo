import assert from "node:assert/strict";
import test from "node:test";
import { uploadScreenInk } from "../src/lib/classroom/screen-ink-upload";
import { isScreenInkUrlAllowed } from "../src/lib/classroom/whiteboard/screen-ink";

const input = "data:image/png;base64,iVBORw0KGgo=";
const context = () => ({ sessionId: "lesson/1", clientId: "client", claimId: "claim", origin: "https://class.example", signal: new AbortController().signal });

test("upload retries an uncertain response with the same ID and returns a credential-free URL", async () => {
  const calls: Array<{ url: string; form: FormData }> = [];
  const request: typeof fetch = async (url, init) => {
    const form = init?.body as FormData;
    calls.push({ url: String(url), form });
    assert.equal(init?.credentials, "same-origin");
    if (calls.length === 1) throw new TypeError("network lost");
    return Response.json({ image: { id: form.get("uploadId") } }, { status: 201 });
  };
  const result = await uploadScreenInk(input, context(), request);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].form.get("uploadId"), calls[1].form.get("uploadId"));
  assert.equal(calls[1].form.get("clientId"), "client");
  assert.equal(calls[1].form.get("claimId"), "claim");
  assert.equal((calls[1].form.get("image") as Blob).type, "image/png");
  assert.equal(result, `https://class.example/api/sessions/lesson%2F1/classroom/screen-ink/${calls[0].form.get("uploadId")}`);
});

test("upload refuses insecure origins, authorization errors, and mismatched asset IDs", async () => {
  await assert.rejects(uploadScreenInk(input, { ...context(), origin: "http://class.example" }), /SCREEN_INK_ORIGIN_UNAVAILABLE/);
  let count = 0;
  await assert.rejects(uploadScreenInk(input, context(), async () => { count++; return new Response(null, { status: 403 }); }), /SCREEN_INK_UPLOAD_FAILED/);
  assert.equal(count, 1);
  await assert.rejects(uploadScreenInk(input, context(), async () => Response.json({ image: { id: "other" } })), /SCREEN_INK_UPLOAD_FAILED/);
  await assert.rejects(uploadScreenInk("data:image/svg+xml;base64,AAAA", context()), /SCREEN_INK_INVALID_IMAGE/);
});

test("HTTP is allowed only for explicit loopback hosts in development", () => {
  for (const address of ["http://localhost:3000/a", "http://127.0.0.1:3000/a"]) {
    assert.equal(isScreenInkUrlAllowed(new URL(address), true), true);
    assert.equal(isScreenInkUrlAllowed(new URL(address), false), false);
  }
  for (const address of ["http://localhost.example/a", "http://192.168.1.2/a", "https://user:password@example.com/a", "data:image/png;base64,AAAA"]) assert.equal(isScreenInkUrlAllowed(new URL(address), true), false);
  assert.equal(isScreenInkUrlAllowed(new URL("https://class.example/a"), false), true);
});
