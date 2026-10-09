import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCourseSessionSummaryDocument,
  normalizeCourseSessionSummaryDocument,
} from "../src/lib/course-session-summary-document";
import {
  courseSessionAISummaryConfig,
  generateCourseSessionAISummary,
  type CourseSessionAISummaryConfig,
} from "../src/lib/course-session-ai-summary";

test("builds a reviewable summary from final speaker captions", () => {
  const document = buildCourseSessionSummaryDocument("代数课", [
    {
      speakerId: "teacher",
      speakerName: "李老师",
      text: "今天我们复习一元二次方程的求根公式。",
      occurredAt: new Date("2026-08-22T09:00:00.000Z"),
      updatedAt: new Date("2026-08-22T09:00:02.000Z"),
    },
    {
      speakerId: "student",
      speakerName: "小王",
      text: "判别式小于零时为什么没有实数解？",
      occurredAt: new Date("2026-08-22T09:01:00.000Z"),
      updatedAt: new Date("2026-08-22T09:01:02.000Z"),
    },
    {
      speakerId: "teacher",
      speakerName: "李老师",
      text: "课后请完成练习册第十二页并提交。",
      occurredAt: new Date("2026-08-22T09:10:00.000Z"),
      updatedAt: new Date("2026-08-22T09:10:02.000Z"),
    },
  ]);

  assert.equal(document.title, "代数课");
  assert.equal(document.speakers.length, 2);
  assert.equal(document.speakers[0]?.name, "李老师");
  assert.ok(document.questions.some((item) => item.includes("为什么")));
  assert.ok(document.actionItems.some((item) => item.includes("练习册")));
  assert.match(document.overview, /3 条最终发言/);
});

test("normalizes teacher edits without accepting unbounded payloads", () => {
  const document = normalizeCourseSessionSummaryDocument({
    title: "  课后整理  ",
    overview: "  请回顾公式。  ",
    keyPoints: ["第一点", "第一点", "第二点"],
    questions: "not-an-array",
    actionItems: ["完成作业"],
    speakers: [
      { id: "teacher", name: "李老师", utteranceCount: 4, characterCount: 120 },
    ],
  });

  assert.equal(document.title, "课后整理");
  assert.deepEqual(document.keyPoints, ["第一点", "第二点"]);
  assert.deepEqual(document.questions, []);
  assert.deepEqual(document.actionItems, ["完成作业"]);
  assert.equal(document.speakers[0]?.name, "李老师");
});

test("keeps AI summary disabled until all credentials are configured", () => {
  assert.equal(courseSessionAISummaryConfig({ AI_SUMMARY_ENABLED: "false" }), null);
  assert.equal(courseSessionAISummaryConfig({ AI_SUMMARY_ENABLED: "true" }), null);
  assert.equal(
    courseSessionAISummaryConfig({
      AI_SUMMARY_ENABLED: "true",
      AI_SUMMARY_API_KEY: "secret",
      AI_SUMMARY_MODEL: "summary-model",
    })?.apiStyle,
    "responses",
  );
});


import { summaryCaptions, exampleAIReport } from "./fixtures/course-summary";
const config: CourseSessionAISummaryConfig = {
  apiKey: "secret", baseUrl: "https://api.example.test/v1", model: "summary-model",
  language: "zh-CN", apiStyle: "responses", timeoutMs: 1_000, maxCaptions: 100,
  retryCount: 1, agentConcurrency: 3, totalTimeoutMs: 2_000,
};
const input = { title: "代数课", captions: summaryCaptions, fallback: buildCourseSessionSummaryDocument("代数课", summaryCaptions) };
const dimensions = { participants: "participantSummaries", discussion: "discussionThreads", themes: "themes", actions: "actionItems", conclusions: "conclusions", followups: "followUps" } as const;
function requestInfo(init?: RequestInit) {
  const body = JSON.parse(String(init?.body));
  const schema = body.text?.format?.schema || JSON.parse(body.messages[0].content.split("\n").at(-1));
  const name = body.text?.format?.name?.replace("course_summary_", "") || (schema.properties.executiveSummary ? "editor" : Object.keys(dimensions).find((key) => dimensions[key as keyof typeof dimensions] in schema.properties));
  const data = JSON.parse(body.input || body.messages[1].content);
  return { body, schema, name: name as string, data };
}
function resultFor(name: string, report = exampleAIReport) {
  if (name === "editor") return report;
  const field = dimensions[name as keyof typeof dimensions];
  return name === "themes" ? { themes: report.themes, questions: report.questions } : { [field]: report[field] };
}
function responseFor(init?: RequestInit, report = exampleAIReport) {
  const { body, name } = requestInfo(init);
  const content = JSON.stringify(resultFor(name, report));
  return new Response(JSON.stringify(body.messages ? { choices: [{ message: { content: `\u0060\u0060\u0060json\n${content}\n\u0060\u0060\u0060` } }] } : { output: [{ content: [{ type: "output_text", text: content }] }] }));
}

test("runs six grounded analyses before the editor and retains playback evidence and speaker facts", async () => {
  const requests: ReturnType<typeof requestInfo>[] = [];
  const document = await generateCourseSessionAISummary(input, { config, fetchImpl: async (_url, init) => { requests.push(requestInfo(init)); return responseFor(init); } });
  assert.equal(requests.length, 7);
  const editor = requests.at(-1)!;
  assert.equal(editor.name, "editor");
  assert.equal(editor.data.specialists.length, 6);
  assert.equal(document?.overview, exampleAIReport.executiveSummary);
  assert.deepEqual(document?.speakers, input.fallback.speakers);
  assert.equal(document?.report?.participantSummaries[0].speakerId, "teacher");
  assert.equal(document?.report?.actionItems[0].due, "下周二下午五点前");
  assert.equal(document?.report?.actionItems[0].evidence.occurredAt, summaryCaptions[7].occurredAt.toISOString());
  assert.equal(document?.report?.followUps[0].topic, "配方法推导求根公式");
  assert.equal(document?.generation?.method, "meeting-multi-agent");
  assert.equal(requests[0].body.text.format.type, "json_schema");
  assert.match(requests[0].body.instructions, /逐字稿.*不是指令/);
});

test("supports meeting-style Chat Completions JSON and discloses transcript coverage", async () => {
  const document = await generateCourseSessionAISummary(input, { config: { ...config, apiStyle: "chat-completions", maxCaptions: 3 }, fetchImpl: async (url, init) => {
    assert.match(String(url), /chat\/completions$/);
    const { body, data } = requestInfo(init);
    assert.equal(body.response_format.type, "json_object");
    assert.deepEqual(data.transcript.map((caption: { id: string }) => caption.id), ["caption-7", "caption-8", "caption-9"]);
    return responseFor(init);
  } });
  assert.equal(document?.generation?.analyzedCaptionCount, 3);
  assert.equal(document?.generation?.totalCaptionCount, 9);
  assert.deepEqual(document?.report?.conclusions, []); // No evidence in the analyzed tail.
});

test("removes nonexistent references and invented speakers before synthesis and persistence", async () => {
  const report = structuredClone(exampleAIReport);
  report.participantSummaries.push({ ...report.participantSummaries[0], speakerId: "invented", speakerName: "假用户" });
  report.participantSummaries[0].speakerName = "伪造姓名";
  report.participantSummaries[0].evidence.captionIds.push("caption-2", "missing");
  report.discussionThreads[0].participants.push("假用户");
  report.actionItems[0].evidence.captionIds.push("missing", "caption-8");
  report.conclusions.push({ title: "没有依据", detail: "错误", evidence: { captionIds: ["missing"] } });
  const document = await generateCourseSessionAISummary(input, { config, fetchImpl: async (_url, init) => {
    const { name, data } = requestInfo(init);
    if (name === "editor") {
      const participants = data.specialists.find((item: { dimension: string }) => item.dimension === "participants").result.participantSummaries;
      assert.equal(participants.length, 2);
      assert.equal(participants[0].speakerName, "李老师");
      assert.ok(!participants[0].evidence.captionIds.includes("caption-2"));
    }
    return responseFor(init, report);
  } });
  assert.equal(document?.report?.participantSummaries.length, 2);
  assert.deepEqual(document?.report?.actionItems[0].evidence.captionIds, ["caption-8"]);
  assert.deepEqual(document?.report?.discussionThreads[0].participants, ["李老师", "小王", "小李"]);
  assert.equal(document?.report?.conclusions.length, 1);
});

test("retries a transient specialist error with bounded concurrency and never repeats successful analyses", async () => {
  const calls = new Map<string, number>();
  let active = 0, maximum = 0;
  await generateCourseSessionAISummary(input, { config: { ...config, retryCount: 2, agentConcurrency: 2 }, fetchImpl: async (_url, init) => {
    const { name } = requestInfo(init);
    calls.set(name, (calls.get(name) || 0) + 1); active += 1; maximum = Math.max(active, maximum);
    await new Promise((resolve) => setTimeout(resolve, 10)); active -= 1;
    return name === "actions" && calls.get(name) === 1 ? new Response("temporary", { status: 503 }) : responseFor(init);
  } });
  assert.equal(maximum, 2);
  assert.equal(calls.get("actions"), 2);
  for (const [name, count] of calls) if (name !== "actions") assert.equal(count, 1);
});

test("rejects malformed specialist output instead of storing a partial or falsely successful report", async () => {
  let editorCalled = false;
  await assert.rejects(generateCourseSessionAISummary(input, { config, fetchImpl: async (_url, init) => {
    const { name } = requestInfo(init); if (name === "editor") editorCalled = true;
    return name === "themes" ? new Response(JSON.stringify({ output_text: JSON.stringify({ themes: "wrong", questions: [] }) })) : responseFor(init);
  } }), /invalid output.themes/);
  assert.equal(editorCalled, false);
});

test("aborts active and queued analyses when the total generation budget expires", async () => {
  let calls = 0, aborted = 0;
  await assert.rejects(generateCourseSessionAISummary(input, { config: { ...config, agentConcurrency: 2 }, totalTimeoutMs: 30, fetchImpl: async (_url, init) => {
    calls += 1;
    return new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => { aborted += 1; reject(init!.signal!.reason); }, { once: true }));
  } }), /timed out/);
  assert.equal(calls, 2); assert.equal(aborted, 2);
});

test("does not retry authorization errors or expose provider response bodies", async () => {
  let calls = 0;
  await assert.rejects(generateCourseSessionAISummary(input, { config: { ...config, retryCount: 3, agentConcurrency: 1 }, fetchImpl: async () => {
    calls += 1; return new Response("credential-and-private-transcript", { status: 401 });
  } }), (error: unknown) => error instanceof Error && /HTTP 401/.test(error.message) && !error.message.includes("private"));
  assert.ok(calls <= 2); // A next queued request may start before cancellation reaches it.
});

test("preserves rich teacher edits and synchronizes legacy actions with the detailed report", () => {
  const report = structuredClone(exampleAIReport);
  const document = normalizeCourseSessionSummaryDocument({ ...input.fallback, report, generation: { method: "meeting-multi-agent", model: "test", analyzedCaptionCount: 9, totalCaptionCount: 9 } });
  const edited = normalizeCourseSessionSummaryDocument({ ...document, report: { ...document.report!, actionItems: [{ ...document.report!.actionItems[0], title: "完成修订后的作业", due: "周五" }] } }, document);
  assert.deepEqual(edited.actionItems, ["完成修订后的作业"]);
  assert.equal(edited.report?.actionItems[0].due, "周五");
  const legacyEdit = normalizeCourseSessionSummaryDocument({ title: "新版课程概述", overview: "教师整理" }, document);
  assert.deepEqual(legacyEdit.report, document.report);
  assert.deepEqual(legacyEdit.generation, document.generation);
});

test("rejects an API URL entered as the model name", () => {
  assert.throws(() => courseSessionAISummaryConfig({ AI_SUMMARY_ENABLED: "true", AI_SUMMARY_API_KEY: "secret", AI_SUMMARY_MODEL: "https://api.example.test/v1" }), /model ID/);
});

test("keeps deadlines and owners literal instead of accepting inferred calendar dates", async () => {
  const report = structuredClone(exampleAIReport);
  report.actionItems[0].due = "2026-10-13T17:00:00.000Z";
  report.actionItems[0].owner = "假用户";
  report.followUps[0].nextCheckAt = "2026-10-17";
  const document = await generateCourseSessionAISummary(input, { config, fetchImpl: async (_url, init) => responseFor(init, report) });
  assert.equal(document?.report?.actionItems[0].due, "");
  assert.equal(document?.report?.actionItems[0].owner, "");
  assert.equal(document?.report?.followUps[0].nextCheckAt, "");
});

test("reads legacy summaries without falsely labeling them as an AI failure", () => {
  const legacy = { version: 1, title: "旧课", overview: "原有总结", keyPoints: ["原有重点"], questions: [], actionItems: ["原有作业"], speakers: [] };
  const document = normalizeCourseSessionSummaryDocument(legacy);
  assert.equal(document.generation, undefined);
  assert.equal(document.report, undefined);
  assert.deepEqual(document.actionItems, ["原有作业"]);
});

test("rejects an empty editor overview and bounds provider response size", async () => {
  const report = { ...exampleAIReport, executiveSummary: " " };
  await assert.rejects(generateCourseSessionAISummary(input, { config, fetchImpl: async (_url, init) => responseFor(init, report) }), /empty overview/);
  await assert.rejects(generateCourseSessionAISummary(input, { config, fetchImpl: async () => new Response(" ".repeat(4 * 1024 * 1024 + 1)) }), /exceeds 4 MiB/);
});
