import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type ClassroomActivity, type ClassroomActivitySubmission } from "@prisma/client";
import { getEffectiveSessionRoster } from "@/lib/course-session-roster";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";
import { prisma } from "@/lib/db";
import type { ClassroomRole } from "@/lib/classroom/types";
import {
  ActivityError, activityCsv, answersMatch, gradeAnswers, publicDefinition, validateActivity, validateAnswers,
  type ActivityAnswers, type ActivityDefinition, type ActivityDetail, type ActivityGrade,
  type ActivityPresentation, type ActivityKind, type ActivityResponse, type ActivityStatus, type ActivitySummary,
} from "@/lib/classroom/activities";

export type ActivityActor = { courseId: string; sessionId: string; userId: string; displayName: string; role: ClassroomRole };
type Tx = Prisma.TransactionClient;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const studentVisibility: Prisma.ClassroomActivityWhereInput = { OR: [{ status: { in: ["active", "closed", "published"] } }, { status: "cancelled", startedAt: { not: null } }] };
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function activityWrite<T>(actor: ActivityActor, run: (tx: Tx, ctx: Awaited<ReturnType<typeof context>>) => Promise<T>): Promise<T> {
  const result = await prisma.$transaction(async tx => {
    const ctx = await context(tx, actor);
    try { return await run(tx, ctx); }
    catch (error) {
      // Validation rejection must still commit authoritative deadline/lesson-end
      // transitions. Database failures continue to roll back the whole transaction.
      if (error instanceof ActivityError) return error;
      throw error;
    }
  });
  if (result instanceof ActivityError) throw result;
  return result;
}
async function activityRead<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await prisma.$transaction(async tx => {
        try { return await run(tx); }
        catch (error) { if (error instanceof ActivityError) return error; throw error; }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      if (result instanceof ActivityError) throw result;
      return result;
    } catch (error) {
      // A read that closes an expired activity can conflict with a concurrent
      // write. Retry with a fresh snapshot; ordinary polls need no writer lock.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
      const adapter = error.meta?.driverAdapterError as { cause?: { kind?: string } } | undefined;
      // Prisma 7's pg adapter reports raw SELECT FOR UPDATE conflicts as P2010.
      const conflict = error.code === "P2034" || (error.code === "P2010" && adapter?.cause?.kind === "TransactionWriteConflict");
      if (attempt >= 2 || !conflict) throw error;
    }
  }
}
function response(row: ClassroomActivitySubmission, reveal: boolean): ActivityResponse {
  return { id: row.id, userId: row.userId, displayName: row.displayName, answers: row.answers as ActivityAnswers,
    grading: reveal ? row.grading as ActivityGrade : null, feedback: reveal ? row.feedback : null, version: row.version, answerVersion: row.answerVersion,
    answerHistory: row.answerHistory as ActivityResponse["answerHistory"], aiReview: reveal ? row.aiReview as ActivityResponse["aiReview"] : undefined,
    submittedAt: row.submittedAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
async function enrolledStudents(tx: Tx, actor: ActivityActor) {
  const [roster, overrides, members] = await Promise.all([
    getEffectiveSessionRoster(actor.sessionId, tx),
    tx.courseSessionStudent.findMany({ where: { sessionId: actor.sessionId } }),
    tx.classroomMemberState.findMany({ where: { sessionId: actor.sessionId, role: "student" } }),
  ]);
  const key = (id: string) => casdoorUserIdCandidates(id).at(-1)?.toLowerCase() || id.toLowerCase();
  const denied = new Set(overrides.filter(s => s.action === "exclude").map(s => key(s.studentId)));
  const rows = new Map((roster?.students || []).map(s => [key(s.userId), { userId: s.userId, displayName: s.displayName, avatar: s.avatar, online: false }]));
  for (const m of members) {
    if (denied.has(key(m.userId))) continue;
    // Joined share-link students can be temporary and absent from the scheduled roster.
    rows.set(key(m.userId), { userId: m.userId, displayName: m.displayName || m.userId, avatar: m.avatar, online: m.presence === "online" && Date.now() - m.lastSeenAt.getTime() < 90000 });
  }
  return [...rows.values()];
}

function summary(row: ClassroomActivity & { _count: { submissions: number } }): ActivitySummary {
  return { id: row.id, title: row.title, kind: row.kind as ActivityKind, status: row.status as ActivityStatus,
    version: row.version, presented: row.presented, presentedQuestion: row.presentedQuestion, durationSec: row.durationSec, startedAt: row.startedAt?.toISOString() || null, deadlineAt: row.deadlineAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), responseCount: row._count.submissions,
    questionCount: (row.definition as ActivityDefinition).questions.length };
}
async function context(tx: Tx, actor: ActivityActor, lock = true) {
  // All answer/close/start/grade writes use the same row lock; permissions are
  // read after acquiring it, so revocation and lesson ending cannot race a write.
  if (lock) await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${actor.sessionId} FOR UPDATE`;
  const runtime = await tx.classroomRuntime.findUnique({ where: { sessionId: actor.sessionId } });
  if (!runtime || runtime.courseId !== actor.courseId) throw new ActivityError("Classroom not found", 404);
  const lesson = await tx.courseSession.findUnique({ where: { id: actor.sessionId }, select: { roomType: true, status: true, endedAt: true } });
  if (!lesson) throw new ActivityError("Lesson not found", 404);
  const interactive = lesson.roomType !== 10;
  const canPrepare = runtime.status !== "ended" && !lesson?.endedAt && !["finished", "cancelled"].includes(lesson?.status || "");
  const live = runtime.status === "live" && canPrepare;
  const canManage = interactive && (actor.role === "teacher" || actor.role === "assistant");
  const needsExpiry = await tx.classroomActivity.findFirst({ where: { sessionId: actor.sessionId, status: "active", ...(live ? { deadlineAt: { lte: new Date() } } : {}) }, select: { id: true } });
  if (!lock && needsExpiry) return context(tx, actor, true);
  const expired = needsExpiry ? await tx.classroomActivity.updateMany({ where: { sessionId: actor.sessionId, status: "active",
    ...(live ? { deadlineAt: { lte: new Date() } } : {}) }, data: { status: "closed", version: { increment: 1 }, closedAt: new Date() } }) : { count: 0 };
  if (expired.count) { await tx.classroomRuntime.update({ where: { id: runtime.id }, data: { revision: { increment: 1 } } }); runtime.revision++; }
  return { runtime, canManage, canAnswer: interactive && actor.role === "student", live, canPrepare };
}
async function bump(tx: Tx, sessionId: string) {
  return (await tx.classroomRuntime.update({ where: { sessionId }, data: { revision: { increment: 1 } } })).revision;
}
export async function listActivities(actor: ActivityActor, cursor?: string | null) {
  const exists = await prisma.classroomRuntime.findUnique({ where: { sessionId: actor.sessionId }, select: { id: true } });
  if (!exists) {
    const lesson = await prisma.courseSession.findFirst({ where: { id: actor.sessionId, courseId: actor.courseId }, select: { roomType: true, status: true, endedAt: true } });
    if (!lesson) throw new ActivityError("Lesson not found", 404);
    return { activities: [], nextCursor: null, active: null, canManage: lesson?.roomType !== 10 && (actor.role === "teacher" || actor.role === "assistant"), canAnswer: lesson?.roomType !== 10 && actor.role === "student", canPrepare: !!lesson && !lesson.endedAt && !["finished", "cancelled"].includes(lesson.status), live: false };
  }
  return activityRead(async tx => {
    const ctx = await context(tx, actor, false);
    const where = { sessionId: actor.sessionId, ...(ctx.canManage ? {} : studentVisibility) };
    if (cursor && !(await tx.classroomActivity.findFirst({ where: { ...where, id: cursor }, select: { id: true } }))) throw new ActivityError("Invalid activity cursor", 400);
    const rows = await tx.classroomActivity.findMany({ where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { _count: { select: { submissions: true } } } });
    const active = await tx.classroomActivity.findFirst({ where: { sessionId: actor.sessionId, status: "active" }, include: { _count: { select: { submissions: true } } } });
    return { activities: rows.slice(0, 50).map(summary), active: active ? summary(active) : null, nextCursor: rows.length > 50 ? rows[49].id : null,
      canManage: ctx.canManage, canAnswer: ctx.canAnswer, canPrepare: ctx.canPrepare, live: ctx.live };
  });
}
export async function activityDetail(actor: ActivityActor, id: string, cursor?: string | null): Promise<ActivityDetail> {
  return activityRead(async tx => {
    const ctx = await context(tx, actor, false);
    const row = await tx.classroomActivity.findFirst({ where: { id, sessionId: actor.sessionId, ...(ctx.canManage ? {} : studentVisibility) }, include: { _count: { select: { submissions: true } } } });
    if (!row) throw new ActivityError("Activity not found", 404);
    const reveal = ctx.canManage || row.status === "published";
    const own = await tx.classroomActivitySubmission.findUnique({ where: { activityId_userId: { activityId: id, userId: actor.userId } } });
    if (cursor && (!ctx.canManage || !(await tx.classroomActivitySubmission.findFirst({ where: { id: cursor, activityId: id }, select: { id: true } })))) throw new ActivityError("Invalid response cursor", 400);
    const rows = ctx.canManage ? await tx.classroomActivitySubmission.findMany({ where: { activityId: id }, orderBy: { id: "asc" }, take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }) : [];
    let statistics: Record<string, Record<string, number>> | null = null;
    const definition = row.definition as ActivityDefinition;
    if (reveal) {
      statistics = Object.fromEntries(definition.questions.map(q => [q.id, Object.fromEntries(q.options.map(o => [o.id, 0]))]));
      // Never expose other students' identifiers or free text in aggregate results.
      const answers = await tx.classroomActivitySubmission.findMany({ where: { activityId: id }, select: { answers: true } });
      for (const a of answers) for (const q of definition.questions) {
        const selected = (a.answers as ActivityAnswers)[q.id];
        if (Array.isArray(selected)) for (const option of selected) if (option in statistics[q.id]) statistics[q.id][option]++;
      }
    }
    const lastReminder = await tx.classroomActivityReminder.findFirst({ where: { activityId: id, ...(ctx.canManage ? {} : { recipients: { array_contains: [actor.userId] } }) }, orderBy: { createdAt: "desc" } });
    const roster = ctx.canManage ? await enrolledStudents(tx, actor) : [];
    const allResponses = ctx.canManage ? await tx.classroomActivitySubmission.findMany({ where: { activityId: id } }) : [];
    const responseMap = new Map(allResponses.map(r => [r.userId, r]));
    return { ...summary(row), definition: publicDefinition(definition, reveal), ownResponse: own ? response(own, reveal) : null,
      responses: rows.slice(0, 50).map(r => response(r, true)), responseCursor: rows.length > 50 ? rows[49].id : null, statistics,
      ...(ctx.canManage ? { roster: roster.map(m => ({ ...m, response: responseMap.has(m.userId) ? response(responseMap.get(m.userId)!, true) : null })), lastRemindedAt: lastReminder?.createdAt.toISOString() || null } : { reminder: !own && row.status === "active" && lastReminder ? { id: lastReminder.id, createdAt: lastReminder.createdAt.toISOString() } : null }) };
  });
}
export async function createActivity(actor: ActivityActor, value: unknown, requestId: string, launch = false) {
  if (!/^[\w-]{8,100}$/.test(requestId)) throw new ActivityError("Invalid request ID");
  if (actor.role === "student") throw new ActivityError("Only authorized teachers can create activities", 403);
  const normalized = validateActivity(value);
  const creationFingerprint = fingerprint(launch ? { ...normalized, launch: true } : normalized);
  const lesson = await prisma.courseSession.findFirst({ where: { id: actor.sessionId, courseId: actor.courseId } });
  if (!lesson) throw new ActivityError("Lesson not found", 404);
  if (actor.role === "assistant" && !(await prisma.classroomRuntime.findUnique({ where: { sessionId: actor.sessionId } }))) throw new ActivityError("Only authorized teachers can create activities", 403);
  await prisma.classroomRuntime.upsert({ where: { sessionId: actor.sessionId }, create: { sessionId: actor.sessionId, courseId: actor.courseId }, update: {} });
  return activityWrite(actor, async (tx, ctx) => {
    if (!ctx.canManage) throw new ActivityError("Only authorized teachers can create activities", 403);
    const previous = await tx.classroomActivity.findUnique({ where: { sessionId_requestId: { sessionId: actor.sessionId, requestId } } });
    if (previous) {
      if (previous.createdBy !== actor.userId || (previous.creationFingerprint ?? fingerprint(validateActivity({ title: previous.title, kind: previous.kind, definition: previous.definition, durationSec: previous.durationSec }))) !== creationFingerprint) throw new ActivityError("Request ID already used", 409);
      return { id: previous.id, revision: ctx.runtime.revision };
    }
    if (!ctx.canPrepare) throw new ActivityError("This lesson has ended. Open another lesson to prepare activities", 409);
    if (launch && !ctx.live) throw new ActivityError("Start the lesson before publishing a draft", 409);
    if (launch) await tx.classroomActivity.updateMany({ where: { sessionId: actor.sessionId, status: "active" }, data: { status: "closed", presented: false, closedAt: new Date(), version: { increment: 1 } } });
    const row = await tx.classroomActivity.create({ data: { runtimeId: ctx.runtime.id, sessionId: actor.sessionId, requestId, createdBy: actor.userId,
      ...normalized, creationFingerprint, definition: json(normalized.definition), ...(launch ? { status: "active", startedAt: new Date(), deadlineAt: normalized.durationSec ? new Date(Date.now() + normalized.durationSec * 1000) : null } : {}) } });
    return { id: row.id, revision: await bump(tx, actor.sessionId) };
  });
}
export async function commandActivity(actor: ActivityActor, id: string, command: Record<string, unknown>) {
  return activityWrite(actor, async (tx, ctx) => {
    const row = await tx.classroomActivity.findFirst({ where: { id, sessionId: actor.sessionId } });
    if (!row) throw new ActivityError("Activity not found", 404);
    const action = command.action;
    if (action === "answer") {
      if (!ctx.canAnswer) throw new ActivityError("Only students can answer", 403);
      const member = await tx.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId: actor.sessionId, userId: actor.userId } } });
      if (!member || member.role !== "student") throw new ActivityError("Join the classroom to answer", 403);
      const definition = row.definition as ActivityDefinition;
      const answers = validateAnswers(definition, command.answers);
      const previous = await tx.classroomActivitySubmission.findUnique({ where: { activityId_userId: { activityId: id, userId: actor.userId } } });
      const expected = command.expectedVersion;
      if (typeof expected !== "number" || !Number.isSafeInteger(expected) || expected < 0) throw new ActivityError("Invalid answer version");
      // A retry after a lost response is safe even after closure or grading. It
      // acknowledges retained data and never changes the score or timestamp.
      if (previous && expected < previous.version && answersMatch(previous.answers as ActivityAnswers, answers)) return { responseId: previous.id, response: response(previous, row.status === "published"), revision: ctx.runtime.revision };
      if (!ctx.live || row.status !== "active" || (row.deadlineAt && row.deadlineAt <= new Date())) throw new ActivityError("Activity is closed; your last saved answer is retained", 409);
      if (expected !== (previous?.version ?? 0)) throw new ActivityError("This answer has changed. Load the saved answer before submitting", 409);
      if (previous && answersMatch(previous.answers as ActivityAnswers, answers)) return { responseId: previous.id, response: response(previous, false), revision: ctx.runtime.revision };
      const grading = gradeAnswers(row.kind as ActivityKind, definition, answers);
      const aiReview = Object.fromEntries(definition.questions.filter(q => q.type === "essay" || q.type === "shortText").map(q => [q.id, { status: "pending" }]));
      for (const questionId of Object.keys(aiReview)) grading[questionId] = null;
      const saved = await tx.classroomActivitySubmission.upsert({ where: { activityId_userId: { activityId: id, userId: actor.userId } },
        create: { activityId: id, userId: actor.userId, displayName: actor.displayName, answers: json(answers), grading: json(grading), aiReview: json(aiReview) },
        update: { version: { increment: 1 }, answerVersion: { increment: 1 }, answerHistory: json([...(previous?.answerHistory as unknown[] || []), ...(previous ? [{ answers: previous.answers, submittedAt: previous.submittedAt.toISOString() }] : [])]), answers: json(answers), grading: json(grading), aiReview: json(aiReview), submittedAt: new Date() } });
      return { responseId: saved.id, response: response(saved, false), revision: await bump(tx, actor.sessionId) };
    }
    if (!ctx.canManage) throw new ActivityError("Only authorized teachers can manage activities", 403);
    if (action === "remind") {
      if (!ctx.live || row.status !== "active") throw new ActivityError("Activity is closed; your last saved answer is retained", 409);
      const requestId = command.requestId;
      if (typeof requestId !== "string" || !/^[\w-]{8,100}$/.test(requestId)) throw new ActivityError("Invalid request ID");
      const previous = await tx.classroomActivityReminder.findUnique({ where: { activityId_requestId: { activityId: id, requestId } } });
      if (previous) return { id, reminderId: previous.id, reminded: (previous.recipients as string[]).length, revision: ctx.runtime.revision };
      const last = await tx.classroomActivityReminder.findFirst({ where: { activityId: id }, orderBy: { createdAt: "desc" } });
      if (last && Date.now() - last.createdAt.getTime() < 30000) throw new ActivityError("Please wait 30 seconds before reminding again", 429);
      const submitted = await tx.classroomActivitySubmission.findMany({ where: { activityId: id }, select: { userId: true } });
      const done = new Set(submitted.map(s => s.userId));
      const recipients = (await enrolledStudents(tx, actor)).filter(s => !done.has(s.userId) && (!command.targetUserId || s.userId === command.targetUserId)).map(s => s.userId);
      if (!recipients.length) return { id, reminded: 0, revision: ctx.runtime.revision };
      const reminder = await tx.classroomActivityReminder.create({ data: { activityId: id, senderId: actor.userId, requestId, recipients: json(recipients) } });
      return { id, reminded: recipients.length, reminderId: reminder.id, revision: await bump(tx, actor.sessionId) };
    } else if (action === "edit") {
      if (row.status !== "draft" || !ctx.canPrepare) throw new ActivityError("Only drafts in unfinished lessons can be edited", 409);
      if (command.expectedVersion !== row.version) throw new ActivityError("This draft has changed. Refresh before saving", 409);
      const normalized = validateActivity(command.activity);
      await tx.classroomActivity.update({ where: { id }, data: { version: { increment: 1 }, ...normalized, definition: json(normalized.definition) } });
    } else if (action === "start") {
      if (row.status === "active") return { id, revision: ctx.runtime.revision };
      if (row.status !== "draft" || !ctx.live) throw new ActivityError("Start the lesson before publishing a draft", 409);
      if (await tx.classroomActivity.count({ where: { sessionId: actor.sessionId, status: "active" } })) throw new ActivityError("Close the current activity first", 409);
      const now = new Date();
      await tx.classroomActivity.updateMany({ where: { sessionId: actor.sessionId, presented: true }, data: { presented: false } });
      await tx.classroomActivity.update({ where: { id }, data: { version: { increment: 1 }, presented: true, presentedQuestion: 0, status: "active", startedAt: now, deadlineAt: row.durationSec ? new Date(now.getTime() + row.durationSec * 1000) : null } });
    } else if (action === "close") {
      if (row.status === "closed" || row.status === "published") return { id, revision: ctx.runtime.revision };
      if (row.status !== "active") throw new ActivityError("Activity is not active", 409);
      await tx.classroomActivity.update({ where: { id }, data: { version: { increment: 1 }, status: "closed", closedAt: new Date() } });
    } else if (action === "cancel") {
      if (row.status === "cancelled") return { id, revision: ctx.runtime.revision };
      if (!["draft", "active", "closed"].includes(row.status)) throw new ActivityError("Published results cannot be cancelled", 409);
      await tx.classroomActivity.update({ where: { id }, data: { version: { increment: 1 }, presented: false, status: "cancelled", closedAt: new Date() } });
    } else if (action === "grade") {
      if (typeof command.responseId !== "string") throw new ActivityError("Invalid response");
      const submission = await tx.classroomActivitySubmission.findFirst({ where: { id: command.responseId, activityId: id } });
      if (!submission) throw new ActivityError("Response not found", 404);
      if (typeof command.feedback !== "string" || command.feedback.length > 4000) throw new ActivityError("Invalid feedback");
      const grades = command.grading as ActivityGrade;
      const questions = (row.definition as ActivityDefinition).questions;
      if (!grades || typeof grades !== "object" || Array.isArray(grades) || Object.keys(grades).length !== questions.length || questions.some(q => typeof grades[q.id] !== "number" || !Number.isFinite(grades[q.id]) || grades[q.id]! < 0 || grades[q.id]! > q.points)) throw new ActivityError("Grade every question within its point limit");
      if (typeof command.expectedVersion !== "number" || !Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) throw new ActivityError("Invalid grade version");
      const unchanged = submission.feedback === command.feedback.trim() && questions.every(q => (submission.grading as ActivityGrade)[q.id] === grades[q.id]);
      if (typeof command.expectedVersion === "number" && command.expectedVersion < submission.version && unchanged) return { id, revision: ctx.runtime.revision };
      if (row.status !== "closed") throw new ActivityError("Close the activity before grading", 409);
      if (command.expectedVersion !== submission.version) throw new ActivityError("This grade has changed. Refresh before saving", 409);
      const feedback = command.feedback.trim();
      const manualReview = Object.fromEntries(questions.map(q => [q.id, { status: "manual", score: grades[q.id], correct: grades[q.id] === q.points, ...(feedback ? { reason: feedback } : {}) }]));
      await tx.classroomActivitySubmission.update({ where: { id: submission.id }, data: { version: { increment: 1 }, grading: json(grades), feedback: command.feedback.trim(), aiReview: json(manualReview) } });
    } else if (action === "publish" || action === "release") {
      if (row.status === "published") return { id, revision: ctx.runtime.revision };
      if (row.status !== "closed" && !(action === "release" && row.status === "active" && ctx.live)) throw new ActivityError("Close the activity before publishing results", 409);
      const submissions = await tx.classroomActivitySubmission.findMany({ where: { activityId: id }, select: { grading: true } });
      if (submissions.some(s => (row.definition as ActivityDefinition).questions.some(q => { const g = (s.grading as ActivityGrade)[q.id]; return typeof g !== "number" || !Number.isFinite(g) || g < 0 || g > q.points; }))) throw new ActivityError("Grade all written answers before publishing results", 409);
      await tx.classroomActivity.updateMany({ where: { sessionId: actor.sessionId, presented: true }, data: { presented: false } });
      await tx.classroomActivity.update({ where: { id }, data: { version: { increment: 1 }, presented: true, status: "published", publishedAt: new Date(), ...(row.status === "active" ? { closedAt: new Date() } : {}) } });
    } else if (action === "present") {
      if (!ctx.live) throw new ActivityError("Start the lesson before presenting an activity", 409);
      if (!["active", "closed", "published"].includes(row.status)) throw new ActivityError("Only published activities can appear on stage", 409);
      const index = command.index;
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= (row.definition as ActivityDefinition).questions.length) throw new ActivityError("Invalid presentation question");
      await tx.classroomActivity.updateMany({ where: { sessionId: actor.sessionId, presented: true }, data: { presented: false } });
      await tx.classroomActivity.update({ where: { id }, data: { version: { increment: 1 }, presented: true, presentedQuestion: index } });
    } else if (action === "hide") {
      await tx.classroomActivity.update({ where: { id }, data: { version: { increment: 1 }, presented: false } });
    } else throw new ActivityError("Unknown activity action");
    return { id, revision: await bump(tx, actor.sessionId) };
  });
}
export async function exportActivity(actor: ActivityActor, id: string) {
  return activityRead(async tx => {
    const ctx = await context(tx, actor, false);
    if (!ctx.canManage) throw new ActivityError("Only authorized teachers can export responses", 403);
    const row = await tx.classroomActivity.findFirst({ where: { id, sessionId: actor.sessionId } });
    if (!row) throw new ActivityError("Activity not found", 404);
    const submissions = await tx.classroomActivitySubmission.findMany({ where: { activityId: id }, orderBy: { id: "asc" } });
    return activityCsv(row.definition as ActivityDefinition, submissions.map(s => response(s, true)));
  });
}

/** Deliberately separate from manager detail: safe for shared stage/DOM recording. */
export async function activityPresentation(sessionId: string): Promise<ActivityPresentation | null> {
  const lesson = await prisma.courseSession.findUnique({ where: { id: sessionId }, select: { courseId: true } });
  if (!lesson) throw new ActivityError("Lesson not found", 404);
  if (!(await prisma.classroomRuntime.count({ where: { sessionId } }))) return null;
  return activityRead(async tx => {
    const ctx = await context(tx, { sessionId, courseId: lesson.courseId, userId: "", displayName: "", role: "student" }, false);
    if (!ctx.live) return null;
    const row = await tx.classroomActivity.findFirst({ where: { sessionId, presented: true, status: { in: ["active", "closed", "published"] } }, include: { _count: { select: { submissions: true } } } });
    if (!row) return null;
    const definition = row.definition as ActivityDefinition;
    const question = publicDefinition(definition, row.status === "published").questions[row.presentedQuestion];
    let statistics: Record<string, number> | null = null;
    if (row.status === "published" && question.options.length) {
      statistics = Object.fromEntries(question.options.map(o => [o.id, 0]));
      const rows = await tx.classroomActivitySubmission.findMany({ where: { activityId: row.id }, select: { answers: true } });
      for (const r of rows) {
        const answer = (r.answers as ActivityAnswers)[question.id];
        if (Array.isArray(answer)) for (const option of answer) if (option in statistics) statistics[option]++;
      }
    }
    return { id: row.id, title: row.title, kind: row.kind as ActivityKind, status: row.status as ActivityStatus,
      questionCount: definition.questions.length, index: row.presentedQuestion, question, responseCount: row._count.submissions, statistics };
  });
}
