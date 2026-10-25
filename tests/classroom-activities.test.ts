import { test } from "node:test";
import assert from "node:assert/strict";
import { activityCsv, gradeAnswers, publicDefinition, validateActivity, validateAnswers } from "../src/lib/classroom/activities";
const choice = { id: "q1", type: "multiple", prompt: "Pick both", points: 5, options: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }], correct: ["a", "b"] };
const essay = { id: "q2", type: "essay", prompt: "Explain", points: 10, options: [] };
const quiz = () => validateActivity({ title: "Quiz", kind: "quiz", definition: { questions: [choice, essay] } });
test("activity validation bounds questions, choices, answer keys and deadlines", () => {
  const { definition } = quiz(); assert.equal(definition.questions.length, 2);
  for (const patch of [{ durationSec: 9 }, { title: "" }, { kind: "poll" }, { definition: { questions: [{ ...choice, correct: ["missing"] }] } }, { definition: { questions: [choice, choice] } }]) assert.throws(() => validateActivity({ ...quiz(), ...patch }));
  assert.throws(() => validateActivity({ ...quiz(), definition: { questions: [{ ...choice, id: "__proto__" }] } }));
  assert.throws(() => validateActivity({ ...quiz(), definition: { questions: [{ ...choice, options: [{ id: "constructor", text: "Bad" }, { id: "b", text: "Good" }], correct: ["b"] }] } }));
  assert.throws(() => validateAnswers(definition, { q1: ["a", "a"], q2: "Hi" }));
  assert.throws(() => validateAnswers(definition, { q1: ["c"] }));
  assert.throws(() => validateAnswers(definition, { q1: ["a"], q2: "Hi", hidden: "x" }));
});
test("automatic grading requires exact multiple choice and leaves written answers ungraded", () => {
  const { definition } = quiz();
  assert.deepEqual(gradeAnswers("quiz", definition, validateAnswers(definition, { q1: ["b", "a"], q2: "Explanation" })), { q1: 5, q2: null });
  assert.deepEqual(gradeAnswers("quiz", definition, validateAnswers(definition, { q1: ["a"], q2: "Explanation" })), { q1: 0, q2: null });
  const short = validateActivity({ title: "Short", kind: "quiz", definition: { questions: [{ id: "q", type: "shortText", prompt: "Name", points: 3, correct: ["Earth"], options: [] }] } });
  assert.deepEqual(gradeAnswers("quiz", short.definition, { q: " ＥＡＲＴＨ " }), { q: 3 });
});
test("student definitions omit answer keys without mutating teacher data", () => {
  const { definition } = quiz(); const safe = publicDefinition(definition, false);
  assert.equal("correct" in safe.questions[0], false); assert.deepEqual(definition.questions[0].correct, ["a", "b"]);
  assert.deepEqual(publicDefinition(definition, true), definition);
});
test("CSV neutralizes spreadsheet formulas and escapes names, answers and feedback", () => {
  const { definition } = quiz(); const csv = activityCsv(definition, [{ id: "r", userId: "u", displayName: "\t=HYPERLINK(\"x\")", answers: { q1: ["a"], q2: "+cmd" }, grading: { q1: 0, q2: 4 }, feedback: "@danger", submittedAt: "today", updatedAt: "today", version: 1 }]);
  assert.ok(csv.startsWith("\ufeff")); assert.ok(csv.includes("'\t=HYPERLINK")); assert.ok(csv.includes("'+cmd")); assert.ok(csv.includes("'@danger")); assert.ok(csv.includes('""x""'));
});

test("answer identity compares persisted JSON keys, choices and normalized text", async () => {
  const { answersMatch } = await import("../src/lib/classroom/activities");
  assert.equal(answersMatch({ choice: ["a", "b"], text: " answer " }, { text: "answer", choice: ["b", "a"] }), true);
  assert.equal(answersMatch({ choice: ["a", "a"] }, { choice: ["a"] }), false);
  assert.equal(answersMatch({ text: "Answer" }, { text: "answer" }), false);
  assert.equal(answersMatch({ text: "answer", other: "extra" }, { text: "answer" }), false);
});
