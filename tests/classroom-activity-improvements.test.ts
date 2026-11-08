import assert from "node:assert/strict";
import test from "node:test";
import { activityResultsVisible, mergeActivityAnswer, type ActivityDetail, type ActivityQuestion, type ActivityRosterMember } from "../src/lib/classroom/activities";
import { assertDraftSelection, removeActivityOption } from "../src/lib/classroom/activity-editor";
import { activityAnswerGroups } from "../src/lib/classroom/activity-statistics";
import { activityRequest } from "../src/lib/classroom/use-activity-detail";

const question: ActivityQuestion = { id: "q", type: "multiple", prompt: "Select prime numbers", points: 10,
  options: [{ id: "a", text: "2" }, { id: "b", text: "3" }, { id: "c", text: "4" }], correct: ["a", "b"] };

test("answer release is per viewer until the teacher expands it to everyone", () => {
  assert.equal(activityResultsVisible({ status: "active" }, true), false);
  assert.equal(activityResultsVisible({ status: "active", answerReleaseScope: "answered" }, true), true);
  assert.equal(activityResultsVisible({ status: "active", answerReleaseScope: "answered" }, false), false);
  assert.equal(activityResultsVisible({ status: "closed", answerReleaseScope: "answered" }, false), false);
  assert.equal(activityResultsVisible({ status: "published" }, false), true);
});
test("removing an option also removes its correct-answer reference without renumbering IDs", () => {
  const next = removeActivityOption(question, "a");
  assert.deepEqual(next.options.map(option => option.id), ["b", "c"]);
  assert.deepEqual(next.correct, ["b"]);
  assert.equal(removeActivityOption(next, "b"), next);
  const boolean = { ...question, type: "boolean" as const };
  assert.equal(removeActivityOption(boolean, "a"), boolean);
});
test("AI cannot substitute a boolean or a relabelled true/false exercise for multiple choice", () => {
  const draft = { title: "Question", kind: "quiz" as const, durationSec: null, definition: { questions: [question] } };
  assert.doesNotThrow(() => assertDraftSelection(draft, "quiz", "multiple"));
  assert.throws(() => assertDraftSelection(draft, "quiz", "boolean"), /did not match/);
  assert.throws(() => assertDraftSelection({ ...draft, definition: { questions: [{ ...question, options: question.options.slice(0, 2), correct: ["a"] }] } }, "quiz", "multiple"), /three options/);
});
const person = (id: string, answer: string | string[]): ActivityRosterMember => ({ userId: id, displayName: id, avatar: "", online: true,
  response: { id, userId: id, displayName: id, answers: { q: answer }, grading: { q: 10 }, feedback: null, version: 1, submittedAt: "", updatedAt: "" } });
test("statistics map multiple selections to the exact students and group short text without folding case", () => {
  const groups = activityAnswerGroups(question, [person("s1", ["a", "b"]), person("s2", ["b", "c"])]);
  assert.deepEqual(groups.map(group => group.members.map(member => member.userId)), [["s1"], ["s1", "s2"], ["s2"]]);
  const text = activityAnswerGroups({ ...question, type: "shortText", options: [] }, [person("s1", " x "), person("s2", "x"), person("s3", "X")]);
  assert.deepEqual(text.map(group => [group.label, group.members.length]), [["x", 2], ["X", 1]]);
});
test("a delayed answer receipt cannot conceal already released answers or replace a newer grade", () => {
  const response = person("s1", ["a"]).response!;
  const detail = { resultsVisible: true, ownResponse: response, definition: { questions: [question] } } as ActivityDetail;
  assert.equal(mergeActivityAnswer(detail, { revision: 1, response, resultsVisible: false, definition: { questions: [{ ...question, correct: undefined }] } }), detail);
  assert.equal(mergeActivityAnswer({ ...detail, ownResponse: { ...response, version: 3 } }, { revision: 1, response, resultsVisible: true })?.ownResponse?.version, 3);
});
test("a lost mutation acknowledgement retries the identical versioned answer; authorization errors do not retry", async () => {
  const original = globalThis.fetch, sent: string[] = [];
  try {
    globalThis.fetch = async (_input, init) => {
      sent.push(String(init?.body));
      if (sent.length === 1) throw new TypeError("Response lost after commit");
      return Response.json({ revision: 9 });
    };
    assert.deepEqual(await activityRequest("https://fixture.invalid", { action: "answer", expectedVersion: 0, answers: { q: ["a"] } }), { revision: 9 });
    assert.equal(sent.length, 2); assert.equal(sent[0], sent[1]);
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ error: "Forbidden" }, { status: 403 }); };
    await assert.rejects(activityRequest("https://fixture.invalid", { action: "release", scope: "all" }), /Forbidden/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
