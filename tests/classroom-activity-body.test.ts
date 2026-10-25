import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { validateActivity, validateAnswers } from "../src/lib/classroom/activities";

test("activity request parsing bounds streamed bytes and accepts all supported payload sizes", async t => {
  const dir = await mkdtemp(path.join(process.cwd(), "node_modules/.cache-activity-body-"));
  try {
    const output = path.join(dir, "body.cjs");
    await build({ entryPoints: ["src/lib/classroom/server/activity-route.ts"], outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: "tsconfig.json", plugins: [{ name: "body-only", setup(b) {
      b.onResolve({ filter: /^(@\/lib\/classroom\/server\/request-access|server-only)$/ }, args => ({ path: args.path, namespace: "mock" }));
      b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "server-only" ? "" : "export const resolveClassroomRequestAccess=()=>{}", loader: "js" }));
    } }] });
    const { activityBody } = createRequire(import.meta.url)(output) as { activityBody(request: Request): Promise<Record<string, unknown>> };
    const request = (body: string) => new Request("https://example.test/activity", { method: "POST", body });
    await t.test("rejects arrays, null and malformed JSON", async () => {
      for (const value of ["[]", "null", "{broken"]) await assert.rejects(activityBody(request(value)), { status: 400 });
    });
    await t.test("maximum multilingual quiz and answers fit the API boundary", async () => {
      const activity = { title: "题目", kind: "quiz", definition: { questions: Array.from({ length: 50 }, (_, i) => ({ id: `q${i}`, type: "shortText", points: 100, prompt: "问".repeat(4000), options: [], correct: Array.from({ length: 20 }, (_, j) => "答".repeat(1995) + String(j)) })) } };
      const raw = JSON.stringify({ activity });
      assert.ok(Buffer.byteLength(raw) > 300_000);
      const data = await activityBody(request(raw));
      const normalized = validateActivity(data.activity);
      const answers = Object.fromEntries(normalized.definition.questions.map(q => [q.id, "字".repeat(10000)]));
      const parsed = await activityBody(request(JSON.stringify({ answers })));
      assert.equal(Object.keys(validateAnswers(normalized.definition, parsed.answers)).length, 50);
    });
    await t.test("oversized bodies without content-length stop the stream before parsing", async () => {
      let cancelled = false;
      const chunk = new Uint8Array(6 * 1024 * 1024);
      const stream = new ReadableStream({ pull(controller) { controller.enqueue(chunk); }, cancel() { cancelled = true; } });
      const req = new Request("https://example.test/activity", Object.assign({ method: "POST", body: stream }, { duplex: "half" }));
      await assert.rejects(activityBody(req), { status: 413 });
      assert.equal(cancelled, true);
    });
    await t.test("oversized declared body is rejected before consuming bytes", async () => {
      const req = new Request("https://example.test/activity", { method: "POST", body: "{}", headers: { "Content-Length": String(11 * 1024 * 1024) } });
      await assert.rejects(activityBody(req), { status: 413 });
      assert.equal(req.bodyUsed, false);
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
