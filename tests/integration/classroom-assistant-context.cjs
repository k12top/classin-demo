/* eslint-disable @typescript-eslint/no-require-imports -- Disposable PostgreSQL exercises context loading and provider input. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.startsWith("/classroom_recovery_"), "requires a disposable loopback database");

async function main() {
  const output = path.join(root, "node_modules/.cache/classroom-assistant-context.cjs");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await esbuild.build({ stdin: { contents: `export {prisma} from '@/lib/db';export {loadClassroomAssistantContext} from '@/lib/classroom/server/assistant-context';export {createClassroomAssistantHandler,createAssistantLimiter} from '@/lib/classroom/server/assistant';`, resolveDir: root }, outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "server-only-marker", setup(build) {
    build.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "", loader: "js" }));
  } }] });
  const api = require(output), db = api.prisma;
  const course = await db.course.create({ data: { name: "数学", description: "学习异分母加法", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher Lin" } });
  const createLesson = position => db.courseSession.create({ data: { courseId: course.id, position, roomUuid: crypto.randomUUID(), roomType: 4, title: `分数第${position}课`, createdBy: "teacher", startTime: new Date(), endTime: new Date(Date.now() + 3600000) } });
  const lesson = await createLesson(3), other = await createLesson(4);
  const runtime = await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, status: "live", sourceLanguage: "zh-CN", startedAt: new Date() } });
  const otherRuntime = await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: other.id, status: "live" } });
  let renamed = false;
  try {
    await db.classroomCaption.createMany({ data: [
      { runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, externalId: "old-homework", speakerName: "Teacher Lin", text: "这节课的作业是完成课本第十二页，下周二提交", isFinal: true, occurredAt: new Date(Date.now() - 3600000) },
      ...Array.from({ length: 90 }, (_, index) => ({ runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, externalId: `caption-${index}`, speakerName: "Teacher Lin", text: `第${index}句：分母相同再相加`, isFinal: true, occurredAt: new Date(Date.now() - 100000 + index * 1000) })),
      { runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, externalId: "partial", speakerName: "Student", text: "PARTIAL_TRANSCRIPT_SECRET", isFinal: false },
      { runtimeId: otherRuntime.id, courseId: course.id, sessionId: other.id, externalId: "other", speakerName: "Other", text: "OTHER_LESSON_SECRET", isFinal: true },
    ] });
    await db.classroomMessage.createMany({ data: [
      { runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, senderId: "student", senderName: "学生", senderRole: "student", content: "先通分的步骤能再解释吗？" },
      ...["staff", "direct", "room"].map(scope => ({ runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, senderId: "teacher", senderName: "Teacher", senderRole: "teacher", scope, content: `${scope.toUpperCase()}_CHAT_SECRET` })),
      { runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, senderId: "teacher", senderName: "Teacher", senderRole: "teacher", content: "DELETED_CHAT_SECRET", deletedAt: new Date() },
      { runtimeId: otherRuntime.id, courseId: course.id, sessionId: other.id, senderId: "teacher", senderName: "Teacher", senderRole: "teacher", content: "OTHER_CHAT_SECRET" },
    ] });
    await db.courseSessionSummary.create({ data: { courseId: course.id, sessionId: lesson.id, document: { overview: "DRAFT_SUMMARY_SECRET" } } });
    let context = await api.loadClassroomAssistantContext(course.id, lesson.id, "student");
    assert.equal(context.teacherName, "Teacher Lin");
    assert.equal(context.lesson.number, 3);
    assert.equal(context.captions.length, 80);
    assert.ok(context.assignmentTranscript.some(item => item.text.includes("第十二页")), "earlier homework survives the recent transcript window");
    assert.deepEqual(context.chat.map(item => item.text), ["先通分的步骤能再解释吗？"]);
    assert.equal(context.summary, undefined);
    assert.ok(!JSON.stringify(context).includes("SECRET"));
    assert.equal(await api.loadClassroomAssistantContext("wrong-course", lesson.id, "student"), null);
    console.log("PASS context is scoped to the resolved course/session and excludes private, retracted and unfinished conversation");

    const tables = await db.$queryRaw`SELECT to_regclass('"ClassroomActivity"') IS NOT NULL AS available`;
    if (tables[0].available) {
      await db.$executeRaw`ALTER TABLE "ClassroomActivity" RENAME TO "AssistantContextActivityBackup"`; renamed = true;
      context = await api.loadClassroomAssistantContext(course.id, lesson.id, "student");
      assert.equal(context.activitiesAvailable, false);
      assert.deepEqual(context.activities, []);
      await db.$executeRaw`ALTER TABLE "AssistantContextActivityBackup" RENAME TO "ClassroomActivity"`; renamed = false;
    } else {
      assert.equal(context.activitiesAvailable, false);
      await db.$executeRaw`CREATE TABLE "ClassroomActivity" ("id" TEXT PRIMARY KEY, "runtimeId" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "requestId" TEXT, "createdBy" TEXT, "title" TEXT, "kind" TEXT, "definition" JSONB, "status" TEXT, "presented" BOOLEAN, "presentedQuestion" INTEGER, "startedAt" TIMESTAMP, "deadlineAt" TIMESTAMP, "createdAt" TIMESTAMP DEFAULT NOW(), "updatedAt" TIMESTAMP DEFAULT NOW())`;
      await db.$executeRaw`CREATE TABLE "ClassroomActivitySubmission" ("id" TEXT PRIMARY KEY, "activityId" TEXT, "userId" TEXT, "displayName" TEXT, "answers" JSONB, "grading" JSONB, "feedback" TEXT, "updatedAt" TIMESTAMP DEFAULT NOW())`;
    }
    console.log("PASS deployments without activity tables continue answering from lesson and dialogue context");

    const quizId = crypto.randomUUID(), workId = crypto.randomUUID();
    const definition = { questions: Array.from({ length: 12 }, (_, index) => ({ id: `q${index}`, prompt: `题${index + 1}：计算分数`, options: [{ id: "A", text: "选择 A" }, { id: "B", text: "选择 B" }], correct: ["ANSWER_KEY_SECRET"] })) };
    const activity = (id, title, status, presented, data, lessonId = lesson.id, runtimeId = runtime.id) => db.$executeRaw`
      INSERT INTO "ClassroomActivity" ("id","runtimeId","sessionId","requestId","createdBy","title","kind","definition","status","presented","presentedQuestion","startedAt","deadlineAt","updatedAt")
      VALUES (${id},${runtimeId},${lessonId},${id},'teacher',${title},'quiz',${JSON.stringify(data)}::jsonb,${status},${presented},9,NOW(),NOW()+INTERVAL '1 day',NOW())`;
    await activity(quizId, "当前练习", "active", true, definition);
    await activity(workId, "课后作业", "published", false, { questions: [{ id: "essay", prompt: "写出通分过程", options: [] }] });
    await activity(crypto.randomUUID(), "DRAFT_WORK_SECRET", "draft", false, definition);
    await activity(crypto.randomUUID(), "OTHER_WORK_SECRET", "closed", false, definition, other.id, otherRuntime.id);
    const submission = (activityId, userId, answers, feedback) => db.$executeRaw`
      INSERT INTO "ClassroomActivitySubmission" ("id","activityId","userId","displayName","answers","grading","feedback","updatedAt")
      VALUES (${crypto.randomUUID()},${activityId},${userId},${userId},${JSON.stringify(answers)}::jsonb,'{}'::jsonb,${feedback},NOW())`;
    await submission(quizId, "student", { q9: ["A"] }, "DRAFT_FEEDBACK_SECRET");
    await submission(workId, "student", { essay: "MY_SUBMISSION" }, "MY_PUBLISHED_FEEDBACK");
    await submission(workId, "another-student", { essay: "OTHER_SUBMISSION_SECRET" }, "OTHER_FEEDBACK_SECRET");
    await db.courseSessionSummary.update({ where: { sessionId: lesson.id }, data: { status: "published", document: { overview: "课堂学习了通分", keyPoints: ["分子分母同时扩大"], actionItems: ["完成课后作业"], report: { actionItems: [{ title: "课本第十二页", owner: "全体学生", due: "下周二", description: "写出解题过程" }] } } } });
    context = await api.loadClassroomAssistantContext(course.id, lesson.id, "student");
    assert.equal(context.activities.length, 2);
    assert.equal(context.activities[0].currentQuestion, 10);
    assert.equal(context.activities[0].questions[0].number, 10);
    assert.deepEqual(context.activities[0].questions[0].ownAnswer, ["A"]);
    const own = context.activities.find(item => item.title === "课后作业");
    assert.equal(own.questions[0].ownAnswer, "MY_SUBMISSION");
    assert.equal(own.ownFeedback, "MY_PUBLISHED_FEEDBACK");
    assert.equal(own.currentQuestion, null);
    assert.ok(context.summary.actionItems.some(item => item.includes("下周二")));
    assert.ok(!JSON.stringify(context).includes("SECRET"));
    const another = await api.loadClassroomAssistantContext(course.id, lesson.id, "another-student");
    assert.ok(!JSON.stringify(another).includes("MY_SUBMISSION"));
    console.log("PASS assigned tasks include the presented question and only the viewer's submission; answer keys and drafts stay private");

    let providerInput;
    const handler = api.createClassroomAssistantHandler({
      authorize: async () => ({ ok: true, userId: "student", courseId: course.id, sessionId: lesson.id }),
      context: api.loadClassroomAssistantContext, reserve: api.createAssistantLimiter(),
      config: () => ({ apiKey: "test", baseUrl: "https://ai.invalid/v1", model: "test", apiStyle: "responses", timeoutMs: 1000 }),
      fetch: async (_url, init) => { providerInput = JSON.parse(String(init.body)); return Response.json({ output_text: "先从当前第十题开始，把两个分母通分。" }); },
    });
    const response = await handler(new Request("https://classroom.test/api/assistant", { method: "POST", body: JSON.stringify({ question: "那这题怎么开始？", sessionId: other.id, context: { title: "FORGED_CONTEXT_SECRET" }, history: [{ role: "user", content: "我不会通分" }, { role: "assistant", content: "先找公倍数" }] }) }), "legacy-course");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sessionId, lesson.id);
    assert.ok(JSON.stringify(providerInput).includes("MY_SUBMISSION"));
    assert.ok(JSON.stringify(providerInput).includes("我不会通分"));
    assert.ok(!JSON.stringify(providerInput).includes("SECRET"));
    console.log("PASS full Q&A handler combines fresh authorized context with private follow-ups and ignores forged client context");
  } finally {
    if (renamed) await db.$executeRaw`ALTER TABLE "AssistantContextActivityBackup" RENAME TO "ClassroomActivity"`;
    await db.course.delete({ where: { id: course.id } }); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
