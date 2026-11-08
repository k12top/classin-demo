/* eslint-disable @typescript-eslint/no-require-imports -- Isolated real PostgreSQL acceptance. */
const assert = require("node:assert/strict");
const { openHarness } = require("./activity-harness.cjs");
(async () => {
  const h = await openHarness(), { api, db, actor } = h;
  const quiz = { title: "Scoped release", kind: "quiz", definition: { questions: [{ id: "q", type: "single", prompt: "2+2", points: 10, options: [{ id: "a", text: "4" }, { id: "b", text: "5" }], correct: ["a"], explanation: "Two plus two is four." }] } };
  try {
    const revision = async () => (await db.classroomRuntime.findUniqueOrThrow({ where: { id: h.runtime.id } })).activityRevision;
    const before = await revision();
    const made = await api.createActivity(actor("teacher"), quiz, crypto.randomUUID(), true);
    assert.ok(made.activity.definition.questions[0].correct);
    const answer = await api.commandActivity(actor("student"), made.id, { action: "answer", expectedVersion: 0, answers: { q: ["b"] } });
    assert.ok(await revision() >= before + 2, "committed changes are observable without any client RTM acknowledgement");
    await api.commandActivity(actor("teacher"), made.id, { action: "release", scope: "answered" });
    const answered = await api.activityDetail(actor("student"), made.id), pending = await api.activityDetail(actor("student2"), made.id);
    assert.equal(answered.status, "active"); assert.equal(answered.resultsVisible, true); assert.deepEqual(answered.definition.questions[0].correct, ["a"]);
    assert.equal(pending.resultsVisible, false); assert.equal(pending.definition.questions[0].correct, undefined); assert.equal(pending.definition.questions[0].explanation, undefined); assert.equal(pending.responses.length, 0); assert.equal(pending.roster, undefined);
    assert.equal((await api.activityPresentation(h.lesson.id))?.question.correct, undefined, "shared stage must not leak answered-only results");
    await assert.rejects(api.commandActivity(actor("student"), made.id, { action: "answer", expectedVersion: answer.response.version, answers: { q: ["a"] } }), { status: 409 });
    const later = await api.commandActivity(actor("student2"), made.id, { action: "answer", expectedVersion: 0, answers: { q: ["a"] } });
    assert.equal(later.resultsVisible, true); assert.equal(later.response.grading.q, 10); assert.deepEqual(later.definition.questions[0].correct, ["a"]);
    await api.commandActivity(actor("teacher"), made.id, { action: "release", scope: "all" });
    const guest = { ...actor("student2"), userId: "unanswered" };
    const all = await api.activityDetail(guest, made.id);
    assert.equal(all.status, "published"); assert.equal(all.resultsVisible, true); assert.equal(all.ownResponse, null); assert.deepEqual(all.definition.questions[0].correct, ["a"]);
    assert.deepEqual((await api.activityPresentation(h.lesson.id)).question.correct, ["a"]);
    await assert.rejects(api.commandActivity(actor("student"), made.id, { action: "release", scope: "all" }), { status: 403 });
    const closed = await api.createActivity(actor("teacher"), quiz, crypto.randomUUID(), true);
    await api.commandActivity(actor("teacher"), closed.id, { action: "close" });
    assert.equal((await api.activityDetail(actor("student2"), closed.id)).definition.questions[0].correct, undefined, "ending responses alone never releases answers");
    const written = await api.createActivity(actor("teacher"), { title: "Unfinished review", kind: "quiz", definition: { questions: [{ id: "q", type: "essay", prompt: "Explain", points: 10, options: [], referenceAnswer: "Expected explanation" }] } }, crypto.randomUUID(), true);
    await api.commandActivity(actor("student"), written.id, { action: "answer", expectedVersion: 0, answers: { q: "Explanation" } });
    await api.commandActivity(actor("teacher"), written.id, { action: "release", scope: "all" });
    const ungraded = await api.activityDetail(actor("student"), written.id);
    assert.equal(ungraded.resultsVisible, true); assert.equal(ungraded.ownResponse.grading.q, null);
    await api.commandActivity(actor("teacher"), written.id, { action: "grade", responseId: ungraded.ownResponse.id, expectedVersion: ungraded.ownResponse.version, grading: { q: 7 }, feedback: "Partly correct" });
    assert.equal((await api.activityDetail(actor("student"), written.id)).ownResponse.grading.q, 7, "teacher can finish grading after releasing reference answers");
    console.log("PASS scoped answer visibility, safe stage, late submission, post-reveal answer lock, committed revision and independent close/release (real PostgreSQL)");
  } finally { await h.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
