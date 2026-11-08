/* eslint-disable @typescript-eslint/no-require-imports -- Real PostgreSQL activity overview and review authorization acceptance. */
const assert = require("node:assert/strict");
const { openHarness } = require("./activity-harness.cjs");
(async () => {
  const h = await openHarness(), { api, db, actor } = h;
  const quiz = { title: "Single", kind: "quiz", definition: { questions: [{ id: "q", type: "single", prompt: "2+2", points: 10, options: [{ id: "a", text: "4" }, { id: "b", text: "5" }], correct: ["a"] }] } };
  const create = (value = quiz, start = true) => api.createActivity(actor("teacher"), value, crypto.randomUUID(), start);
  const answer = (id, userId, value) => api.commandActivity(actor(userId), id, { action: "answer", expectedVersion: 0, answers: { q: value } });
  try {
    const first = await create(); await answer(first.id, "student", ["b"]); await answer(first.id, "student2", ["a"]);
    await api.commandActivity(actor("teacher"), first.id, { action: "release", scope: "answered" });
    const second = await create({ ...quiz, title: "Multiple", definition: { questions: [{ ...quiz.definition.questions[0], type: "multiple", correct: ["a", "b"] }] } });
    await answer(second.id, "student", ["a", "b"]);
    const poll = await create({ ...quiz, title: "Poll", kind: "poll", definition: { questions: [{ ...quiz.definition.questions[0], correct: undefined }] } }); await answer(poll.id, "student", ["a"]);
    const written = await create({ title: "Pending review", kind: "quiz", definition: { questions: [{ id: "q", type: "essay", prompt: "Explain", points: 10, options: [] }] } }); await answer(written.id, "student", "Explanation");
    const cancelled = await create(); await answer(cancelled.id, "student2", ["b"]); await api.commandActivity(actor("teacher"), cancelled.id, { action: "cancel" });
    await create(quiz, false);
    const teacher = await api.activityOverview(actor("teacher"));
    assert.equal(teacher.activityCount, 4); assert.equal(teacher.activities.length, 5); assert.equal(teacher.studentCount, 2); assert.equal(teacher.submissions, 5); assert.equal(teacher.participation, 62.5);
    assert.equal(teacher.quality.correct, 2); assert.equal(teacher.quality.incorrect, 1); assert.equal(teacher.quality.pending, 1); assert.equal(teacher.accuracy, 2 / 3 * 100);
    assert.equal(teacher.quality.earnedPoints, 20); assert.equal(teacher.quality.gradedPoints, 30);
    const own = await api.activityOverview(actor("student"));
    assert.equal(own.students, undefined); assert.equal(own.studentCount, 1); assert.equal(own.submissions, 4); assert.equal(own.participation, 100); assert.equal(own.accuracy, 0); assert.equal(own.quality.withheld, 2);
    assert.equal(own.activities.find(item => item.id === second.id).quality.earnedPoints, 0);
    assert.equal(JSON.stringify(own).includes("student2"), false); assert.equal(JSON.stringify(own).includes('"answers"'), false); assert.equal(JSON.stringify(own).includes('"definition"'), false);
    const other = await api.activityOverview(actor("student2")); assert.equal(other.activities.find(item => item.id === second.id).responseCount, 0, "peer response counts cannot enter personal overview");
    await api.commandActivity(actor("teacher"), second.id, { action: "release", scope: "answered" });
    assert.equal((await api.activityOverview(actor("student"))).accuracy, 50);
    assert.equal((await api.activityOverview(actor("student2"))).activities.find(item => item.id === second.id).resultsVisible, false);
    await db.classroomMemberState.deleteMany({ where: { sessionId: h.lesson.id, userId: "student2" } });
    assert.ok((await api.activityDetail(actor("teacher"), first.id)).roster.some(member => member.userId === "student2" && member.response), "teacher review includes past responders no longer in the roster");
    const large = await create();
    await db.classroomMemberState.createMany({ data: Array.from({ length: 55 }, (_, i) => ({ runtimeId: h.runtime.id, courseId: h.course.id, sessionId: h.lesson.id, userId: `past-${i}`, displayName: `Past student ${i}`, role: "student", presence: "online" })) });
    for (let i = 0; i < 55; i++) await answer(large.id, `past-${i}`, ["a"]);
    await db.classroomMemberState.deleteMany({ where: { sessionId: h.lesson.id, userId: { startsWith: "past-" } } });
    const allResponses = await api.activityDetail(actor("teacher"), large.id); assert.equal(allResponses.responses.length, 50); assert.equal(allResponses.roster.filter(member => member.response).length, 55);
    for (let i = 0; i < 51; i++) await create();
    assert.ok((await api.activityOverview(actor("teacher"))).activities.length > 50);
    await db.courseSession.update({ where: { id: h.lesson.id }, data: { status: "finished", endedAt: new Date() } }); await db.classroomRuntime.update({ where: { id: h.runtime.id }, data: { status: "ended" } });
    const ended = await api.activityOverview(actor("teacher")); assert.equal(ended.live, false); assert.ok(ended.activities.length > 50);
    assert.equal((await api.activityDetail(actor("student"), first.id)).responses.length, 0); assert.equal((await api.activityDetail(actor("student"), first.id)).roster, undefined);
    assert.deepEqual((await api.activityDetail(actor("teacher"), second.id)).definition.questions[0].correct, ["a", "b"]);
    await assert.rejects(api.activityOverview({ ...actor("teacher"), courseId: "another-course" }), { status: 404 });
    console.log("PASS real PostgreSQL overview metrics, pending/poll exclusions, private own-only grades, all history beyond 50, all past responders and after-class review");
  } finally { await h.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
