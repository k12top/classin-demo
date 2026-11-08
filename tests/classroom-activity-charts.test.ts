import assert from "node:assert/strict";
import test from "node:test";
import { activityChartOption, overviewQuestionRows, qualityTotal, type ActivityChartPalette } from "../src/lib/classroom/activity-chart-model";
import { activityOverviewCopy } from "../src/lib/classroom/activity-overview-copy";
import { summarizeActivities, emptyActivityQuality, type ActivityReportSource } from "../src/lib/classroom/activity-overview";
import type { ActivitySummary } from "../src/lib/classroom/activities";
const c = activityOverviewCopy("zh-CN");
const palette: ActivityChartPalette = { ink: "#20242b", line: "#e5e7ed", background: "#fff", accent: "#6254be", correct: "#28765b", incorrect: "#b34550", partial: "#956315", pending: "#78839b", withheld: "#8b78b3" };
const summary: ActivitySummary = { id: "activity", title: "Title", kind: "quiz", status: "closed", questionCount: 1, responseCount: 1, version: 1, presented: false, presentedQuestion: 0, durationSec: null, startedAt: "2026-11-08T00:00:00Z", deadlineAt: null, createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z" };
function source(id: string, visible = true, score: number | null = 10): ActivityReportSource {
  return { activity: { ...summary, id }, resultsVisible: visible, definition: { questions: [{ id: "q", type: "essay", prompt: id, options: [], points: 10 }] }, responses: [{ id, userId: "student", displayName: "Student", answers: { q: "Saved answer" }, grading: { q: score }, feedback: null, version: 1, submittedAt: "", updatedAt: "" }] };
}
test("question charts retain individual exam questions, exclude polls/cancellations, and number chronologically", () => {
  const exam = source("exam"); exam.activity.questionCount = 2; exam.definition.questions.push({ ...exam.definition.questions[0], id: "second" });
  exam.responses[0].answers.second = "Wrong"; exam.responses[0].grading!.second = 0;
  const poll = source("poll"); poll.activity.kind = "poll";
  const cancelled = source("cancelled"); cancelled.activity.status = "cancelled";
  const data = summarizeActivities([exam, poll, cancelled, source("first")], [], true, true), rows = overviewQuestionRows(data);
  assert.deepEqual(rows.map(row => row.number), [3, 2, 1]);
  assert.deepEqual(rows.map(row => row.accuracy), [0, 100, 100]);
  assert.deepEqual(rows.map(row => row.activityId), ["exam", "exam", "first"]);
});
test("unreleased personal grades stay null in chart data and render waiting rather than a zero score", () => {
  const data = summarizeActivities([source("Hidden", false)], [], false, true), rows = overviewQuestionRows(data);
  assert.equal(rows[0].accuracy, null); assert.equal(rows[0].quality.correct, 0); assert.equal(rows[0].quality.withheld, 1);
  const option = activityChartOption({ kind: "questions", rows, copy: c }, palette, "zh-CN", 320);
  const series = (option.series as Array<{ label: { formatter: (p: { dataIndex: number }) => string }; tooltip: { formatter: (p: { dataIndex: number }) => string } }>)[0];
  assert.equal(series.label.formatter({ dataIndex: 0 }), "待下发");
  assert.ok(series.tooltip.formatter({ dataIndex: 0 }).includes("待下发"));
  assert.ok(!series.tooltip.formatter({ dataIndex: 0 }).includes("100%"));
});
test("zero accuracy differs from pending and partial results count once in quality distribution", () => {
  const data = summarizeActivities([source("Wrong", true, 0), source("Pending", true, null), source("Partial", true, 5)], [], true, true), rows = overviewQuestionRows(data);
  assert.equal(qualityTotal(data.quality), 3);
  assert.equal(data.quality.partial, 1);
  const option = activityChartOption({ kind: "questions", rows, copy: c }, palette, "zh-CN", 320);
  const series = (option.series as Array<{ label: { formatter: (p: { dataIndex: number }) => string } }>)[0];
  assert.equal(series.label.formatter({ dataIndex: 0 }), "0%");
  assert.equal(series.label.formatter({ dataIndex: 1 }), "待批阅");
  assert.equal(series.label.formatter({ dataIndex: 2 }), "0%");
});
test("only registered bar series are needed; safe rich-text tooltips and zero-motion options work in both chart sizes", () => {
  const quality = { ...emptyActivityQuality(), correct: 3, incorrect: 1, pending: 1 };
  const options = activityChartOption({ kind: "quality", quality, copy: c }, palette, "en", 320);
  assert.equal(options.animation, false);
  assert.equal((options.tooltip as { renderMode: string }).renderMode, "richText");
  assert.equal((options.series as unknown[]).length, 3);
  const empty = activityChartOption({ kind: "quality", quality: emptyActivityQuality(), copy: c }, palette, "en", 900);
  assert.deepEqual(empty.series, []);
});
test("a question without submissions stays ungraded rather than becoming zero-percent accuracy", () => {
  const unanswered = source("No submission"); unanswered.responses = [];
  const rows = overviewQuestionRows(summarizeActivities([unanswered], [], true, true));
  assert.equal(rows[0].accuracy, null);
  const option = activityChartOption({ kind: "questions", rows, copy: c }, palette, "zh-CN", 320);
  const series = (option.series as Array<{ label: { formatter: (p: { dataIndex: number }) => string } }>)[0];
  assert.equal(series.label.formatter({ dataIndex: 0 }), "未作答");
});
