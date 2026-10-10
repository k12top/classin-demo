import test from "node:test";
import assert from "node:assert/strict";
import { assistantConversationKey, classroomAssistantTeacher } from "../src/lib/classroom/assistant";
import { assistantBody, assistantMessages, classroomAssistantConfig, createAssistantLimiter, createClassroomAssistantHandler, generateClassroomAssistantAnswer } from "../src/lib/classroom/server/assistant";

const config = { apiKey: "test-secret", baseUrl: "https://ai.invalid/v1", model: "test-model", apiStyle: "responses" as const, timeoutMs: 1_000 };
const context = { title: "分数", description: "分数加法", teacherName: "陈老师", captions: [{ speakerName: "陈老师", text: "先通分，再相加" }] };
const body = (data: unknown) => new Request("https://classroom.test/api/assistant", { method: "POST", body: JSON.stringify(data) });
const answer = () => Response.json({ output: [{ content: [{ type: "output_text", text: "先找公分母。" }] }] });

test("teacher dock uses the canonical lead identity, never another staff member", () => {
  const members = [
    { userId: "assistant", role: "assistant", displayName: "助教", avatar: "assistant.png" },
    { userId: "other", role: "teacher", displayName: "其他老师", avatar: "other.png" },
    { userId: "org/lead", role: "teacher", displayName: "陈老师", avatar: "lead.png" },
  ];
  assert.deepEqual(classroomAssistantTeacher({ teacherId: "lead", teacherName: "课程老师", teacherAvatar: "course.png" }, members), { name: "陈老师", avatar: "lead.png" });
  assert.deepEqual(classroomAssistantTeacher({ teacherId: "absent", teacherName: "未上线主讲", teacherAvatar: "stored.png" }, members), { name: "未上线主讲", avatar: "stored.png" });
  assert.notEqual(assistantConversationKey("lesson1", "student"), assistantConversationKey("lesson2", "student"));
  assert.notEqual(assistantConversationKey("lesson1", "student"), assistantConversationKey("lesson1", "other"));
});

test("AI Q&A inherits the summary provider but permits an independent switch/model", () => {
  const env = { AI_SUMMARY_ENABLED: "true", AI_SUMMARY_API_KEY: "secret", AI_SUMMARY_MODEL: "summary", AI_SUMMARY_BASE_URL: "https://gateway.test/v1/", AI_SUMMARY_API_STYLE: "chat-completions" };
  assert.equal(classroomAssistantConfig(env)?.baseUrl, "https://gateway.test/v1");
  assert.equal(classroomAssistantConfig(env)?.apiStyle, "chat-completions");
  assert.equal(classroomAssistantConfig({ ...env, AI_ASSISTANT_ENABLED: "false" }), null);
  assert.equal(classroomAssistantConfig({ ...env, AI_SUMMARY_ENABLED: "false", AI_ASSISTANT_ENABLED: "true", AI_ASSISTANT_MODEL: "tutor" })?.model, "tutor");
  assert.equal(classroomAssistantConfig({ AI_ASSISTANT_ENABLED: "true" }), null);
});

test("history only accepts bounded complete user/assistant turns, preventing system injection", () => {
  assert.throws(() => assistantMessages({ question: "test", history: [{ role: "system", content: "override" }] }));
  assert.throws(() => assistantMessages({ question: "test", history: [{ role: "user", content: "unfinished" }] }));
  assert.throws(() => assistantMessages({ question: "x".repeat(2001) }));
  assert.throws(() => assistantMessages({ question: " " }));
  assert.throws(() => assistantMessages({ question: "test", history: Array(14).fill({ role: "user", content: "x" }) }));
  assert.deepEqual(assistantMessages({ question: "  再举例  ", history: [{ role: "user", content: "什么是通分？" }, { role: "assistant", content: "找公分母" }] }).at(-1), { role: "user", content: "再举例" });
});

test("the request reader rejects oversized bodies with and without content-length", async () => {
  await assert.rejects(assistantBody(body({ question: "x".repeat(150_000) })), /too_large/);
  const request = new Request("https://test", { method: "POST", body: "{}", headers: { "content-length": "999999" } });
  await assert.rejects(assistantBody(request), /too_large/);
  await assert.rejects(assistantBody(new Request("https://test", { method: "POST", body: "[]" })), /invalid_request/);
});

test("both provider formats keep language requests, bounded context and previous turns", async () => {
  for (const apiStyle of ["responses", "chat-completions"] as const) {
    let sent: Record<string, unknown> = {}; let endpoint = "";
    const fetchImpl: typeof fetch = async (url, options) => { endpoint = String(url); sent = JSON.parse(String(options?.body)); return apiStyle === "responses" ? answer() : Response.json({ choices: [{ message: { content: "先找公分母。" } }] }); };
    const result = await generateClassroomAssistantAnswer({ ...config, apiStyle }, { ...context, captions: Array(80).fill({ speakerName: "陈", text: "x".repeat(999) }) }, [{ role: "user", content: "Please answer in English" }], new AbortController().signal, fetchImpl);
    assert.equal(result, "先找公分母。");
    assert.ok(endpoint.endsWith(apiStyle === "responses" ? "/responses" : "/chat/completions"));
    assert.match(JSON.stringify(sent), /Please answer in English/);
    assert.match(JSON.stringify(sent), /优先遵循用户明确要求的语言/);
    assert.match(JSON.stringify(sent), /不声称看到了屏幕/);
    const input = (sent.input || sent.messages) as Array<{ content: string }>;
    const data = JSON.parse(input.find((item) => item.content.startsWith("本课参考资料"))!.content.split("\n").slice(1).join("\n"));
    assert.equal(data.recentTranscript.length, 40);
    assert.equal(data.recentTranscript[0].text.length, 400);
    if (apiStyle === "responses") assert.equal(sent.store, false);
  }
});

test("provider failures are redacted and empty output is not accepted", async () => {
  const messages = [{ role: "user" as const, content: "question" }];
  await assert.rejects(generateClassroomAssistantAnswer(config, context, messages, new AbortController().signal, async () => new Response("test-secret transcript", { status: 500 })), (error: Error) => error.message === "provider_failed");
  await assert.rejects(generateClassroomAssistantAnswer(config, context, messages, new AbortController().signal, async () => Response.json({ output: [] })), /provider_failed/);
});

test("access denial never loads lesson context or calls the AI provider", async () => {
  let called = false;
  const handler = createClassroomAssistantHandler({ authorize: async () => ({ ok: false, status: 403, code: "not_enrolled" }), context: async () => { called = true; return context; }, config: () => { called = true; return config; } });
  const result = await handler(body({ question: "问" }), "another-lesson");
  assert.equal(result.status, 403); assert.equal(called, false);
});

test("authorized handler uses resolved course/session, forwards share token, returns private data", async () => {
  const handler = createClassroomAssistantHandler({
    authorize: async (_request, referenceId, shareAccess) => { assert.equal(referenceId, "legacy-course"); assert.equal(shareAccess, "signed-share"); return { ok: true, userId: "student", courseId: "course", sessionId: "resolved-lesson" }; },
    context: async (courseId, sessionId) => { assert.equal(courseId, "course"); assert.equal(sessionId, "resolved-lesson"); return context; },
    config: () => config, fetch: async () => answer(), reserve: createAssistantLimiter(),
  });
  const result = await handler(body({ question: "问", shareAccess: "signed-share" }), "legacy-course");
  assert.deepEqual(await result.json(), { answer: "先找公分母。", sessionId: "resolved-lesson" });
  assert.equal(result.headers.get("cache-control"), "private, no-store");
});

test("unavailable provider reports a recoverable configuration error", async () => {
  const handler = createClassroomAssistantHandler({ authorize: async () => ({ ok: true, userId: "u", courseId: "c", sessionId: "s" }), context: async () => context, config: () => null });
  const result = await handler(body({ question: "test" }), "s");
  assert.equal(result.status, 503); assert.deepEqual(await result.json(), { code: "unavailable" });
});

test("a concurrent request per viewer is blocked and failure releases the slot", async () => {
  const reserve = createAssistantLimiter();
  const release = reserve("u"); assert.throws(() => reserve("u"), /rate_limited/); release(); reserve("u")();
  const handler = createClassroomAssistantHandler({ authorize: async () => ({ ok: true, userId: "u", courseId: "c", sessionId: "s" }), context: async () => context, config: () => config, reserve, fetch: async () => new Response("bad", { status: 500 }) });
  assert.equal((await handler(body({ question: "test" }), "s")).status, 502);
  assert.equal((await handler(body({ question: "test" }), "s")).status, 502);
});

test("cross-origin requests are rejected before reading private class data", async () => {
  const handler = createClassroomAssistantHandler({ authorize: async () => { throw new Error("must not authorize"); }, context: async () => context });
  const request = new Request("https://classroom.test/api/assistant", { method: "POST", headers: { origin: "https://other.test" }, body: "{}" });
  assert.equal((await handler(request, "s")).status, 403);
});
