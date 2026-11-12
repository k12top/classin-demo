import assert from "node:assert/strict";
import test from "node:test";
import { summarizeActivities, type ActivityReportSource } from "../src/lib/classroom/activity-overview";
import type { ActivityResponse, ActivitySummary } from "../src/lib/classroom/activities";
const activity: ActivitySummary = { id: "q", title: "Question", kind: "quiz", status: "closed", questionCount: 1, responseCount: 1, version: 1, presented: false, presentedQuestion: 0, durationSec: null, startedAt: "2026-11-08T00:00:00Z", deadlineAt: null, createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z" };
const answer = (userId: string, score: number | null): ActivityResponse => ({ id: userId, userId, displayName: userId, answers: { q: "Answer" }, grading: { q: score }, feedback: null, version: 1, submittedAt: "", updatedAt: "" });
const source = (id: string, score: number | null, visible = true): ActivityReportSource => ({ activity: { ...activity, id }, definition: { questions: [{ id: "q", type: "essay", prompt: "Explain", points: 10, options: [] }] }, responses: [answer("student", score)], resultsVisible: visible });
test("lesson quality excludes pending, unanswered and polls from accuracy while retaining participation", () => {
  const sources = [source("correct", 10), source("partial", 5), source("pending", null), { ...source("poll", 0), activity: { ...activity, id: "poll", kind: "poll" as const } }, { ...source("cancelled", 0), activity: { ...activity, id: "cancelled", status: "cancelled" as const } }];
  const result = summarizeActivities(sources, ["student", "unanswered"].map(userId => ({ userId, displayName: userId, avatar: "", online: false })), true, false);
  assert.equal(result.activityCount, 4); assert.equal(result.submissions, 4); assert.equal(result.participation, 50);
  assert.equal(result.accuracy, 50); assert.equal(result.quality.correct, 1); assert.equal(result.quality.partial, 1); assert.equal(result.quality.pending, 1);
  assert.equal(result.quality.earnedPoints, 15); assert.equal(result.quality.gradedPoints, 20);
  assert.equal(result.students?.find(student => student.userId === "unanswered")?.accuracy, null);
  assert.equal(result.activities.length, 5, "cancelled activity remains in history");
});
test("unreleased own results reveal no grade through dashboard totals", () => {
  const result = summarizeActivities([source("private", 10, false)], [], false, true);
  assert.equal(result.students, undefined); assert.equal(result.accuracy, null); assert.equal(result.quality.earnedPoints, 0); assert.equal(result.quality.gradedPoints, 0);
  assert.equal(result.quality.withheld, 1); assert.equal(result.activities[0].quality.correct, 0);
  assert.equal(result.activities[0].questions[0].accuracy, null);
  assert.equal(result.activities[0].questions[0].quality.earnedPoints, 0);
  assert.equal("definition" in result.activities[0], false); assert.equal("responses" in result.activities[0], false);
});
test("an exam reports separate question quality rather than repeating the whole-exam rate", () => {
  const mixed = source("exam", 10);
  mixed.activity.questionCount = 2;
  mixed.definition.questions.push({ ...mixed.definition.questions[0], id: "second", prompt: "Second question" });
  mixed.responses[0].answers.second = "Different answer";
  mixed.responses[0].grading!.second = 0;
  const result = summarizeActivities([mixed], [], true, true);
  assert.equal(result.accuracy, 50);
  assert.deepEqual(result.activities[0].questions.map(question => question.accuracy), [100, 0]);
  assert.equal(result.questionCount, 2);
});
test("all published interactions are included beyond the first history page", () => {
  const result = summarizeActivities(Array.from({ length: 75 }, (_, i) => source(String(i), 10)), [], true, false);
  assert.equal(result.activityCount, 75); assert.equal(result.activities.length, 75); assert.equal(result.students?.[0].submissions, 75); assert.equal(result.accuracy, 100);
});

test("compact overview preserves the student's own scope and omits roster data", async () => {
  const { activityOverviewSummary } = await import("../src/lib/classroom/activity-overview");
  const teacher = summarizeActivities([source("a", 10, true)], [], true, false);
  const student = summarizeActivities([source("a", 10, false)], [], false, false);
  const a = activityOverviewSummary(teacher), b = activityOverviewSummary(student);
  assert.equal(a.participants, 1);
  assert.equal(b.participants, null);
  assert.equal(b.accuracy, null);
  assert.equal("students" in b, false);
  assert.equal("activities" in b, false);
});
