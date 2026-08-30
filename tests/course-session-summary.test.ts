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

test("generates a structured AI lesson summary while preserving speaker facts", async () => {
  const fallback = buildCourseSessionSummaryDocument("代数课", [
    {
      speakerId: "teacher",
      speakerName: "李老师",
      text: "今天复习一元二次方程。",
      occurredAt: new Date("2026-08-22T09:00:00.000Z"),
      updatedAt: new Date("2026-08-22T09:00:02.000Z"),
    },
  ]);
  const config: CourseSessionAISummaryConfig = {
    apiKey: "secret",
    baseUrl: "https://api.example.test/v1",
    model: "summary-model",
    language: "zh-CN",
    apiStyle: "responses",
    timeoutMs: 1_000,
    maxCaptions: 100,
    retryCount: 1,
  };
  let requestBody: Record<string, unknown> | null = null;
  const document = await generateCourseSessionAISummary(
    {
      title: "代数课",
      captions: [
        {
          id: "caption-1",
          speakerId: "teacher",
          speakerName: "李老师",
          text: "今天复习一元二次方程。",
          occurredAt: new Date("2026-08-22T09:00:00.000Z"),
          updatedAt: new Date("2026-08-22T09:00:02.000Z"),
        },
      ],
      fallback,
    },
    {
      config,
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          output_text: JSON.stringify({
            overview: "本节课复习了一元二次方程。",
            keyPoints: ["求根公式"],
            questions: [],
            actionItems: ["完成课后练习"],
          }),
        }));
      },
    },
  );

  assert.equal(document?.overview, "本节课复习了一元二次方程。");
  assert.deepEqual(document?.speakers, fallback.speakers);
  assert.equal((requestBody?.text as { format?: { type?: string } }).format?.type, "json_schema");
});
