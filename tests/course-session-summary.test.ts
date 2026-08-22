import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCourseSessionSummaryDocument,
  normalizeCourseSessionSummaryDocument,
} from "../src/lib/course-session-summary-document";

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
