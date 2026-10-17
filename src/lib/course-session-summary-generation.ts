import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { generateCourseSessionSummary } from "./course-session-summary";

const LEASE_MS = 300_000;
const MAX_ATTEMPTS = 3;

export type SummaryGenerationState = {
  status: "queued" | "running" | "completed" | "failed";
  requestId: string;
  error: string | null;
};

export function publicSummaryGeneration(job: { status: string; requestId: string; error: string | null } | null): SummaryGenerationState | null {
  return job ? { status: job.status as SummaryGenerationState["status"], requestId: job.requestId, error: job.error } : null;
}

export function summaryGenerationNeedsWorker(job: { status: string; startedAt: Date | null } | null) {
  return job?.status === "queued" || (job?.status === "running" && job.startedAt !== null && job.startedAt.getTime() < Date.now() - LEASE_MS);
}

/** Queue once across lifecycle callbacks, cron runs and repeated button clicks. */
export async function queueCourseSessionSummary(courseId: string, sessionId: string, requestedBy = "system", force = false) {
  const lesson = await prisma.courseSession.findFirst({ where: { id: sessionId, courseId }, select: { status: true } });
  if (!lesson) throw new Error("Course session not found");
  if (!force && requestedBy === "system" && !["afterClass", "finished"].includes(lesson.status)) return null;
  const [summary, source] = await Promise.all([
    prisma.courseSessionSummary.findUnique({ where: { sessionId } }),
    prisma.classroomCaption.aggregate({ where: { sessionId, courseId, isFinal: true }, _count: true, _max: { updatedAt: true } }),
  ]);
  if (!source._count) return null;
  if (!force && requestedBy === "system" && summary && (summary.status === "published" || summary.generatedBy !== "system" || (
    summary.captionCount === source._count && summary.sourceUpdatedAt && source._max.updatedAt && summary.sourceUpdatedAt >= source._max.updatedAt
  ))) return null;

  const now = new Date();
  const job = await prisma.courseSessionSummaryGeneration.upsert({
    where: { sessionId }, create: { sessionId, courseId, requestedBy }, update: {},
  });
  const running = job.status === "running" && job.startedAt && job.startedAt.getTime() > now.getTime() - LEASE_MS;
  if (job.status === "queued" || running) return job;
  if (!force && job.status === "failed" && (job.attempts >= MAX_ATTEMPTS || job.nextAttemptAt > now)) return job;
  await prisma.courseSessionSummaryGeneration.updateMany({
    where: { sessionId, requestId: job.requestId, status: job.status, updatedAt: job.updatedAt },
    data: { status: "queued", requestId: randomUUID(), requestedBy, startedAt: null, finishedAt: null, nextAttemptAt: now, error: null, ...(force && { attempts: 0 }) },
  });
  return prisma.courseSessionSummaryGeneration.findUniqueOrThrow({ where: { sessionId } });
}

/** A database lease prevents concurrent workers from analyzing the same lesson. */
export async function processCourseSessionSummaryGeneration(sessionId: string, totalTimeoutMs = 240_000) {
  const now = new Date();
  const runId = randomUUID();
  await prisma.courseSessionSummaryGeneration.updateMany({
    where: { sessionId, attempts: { gte: MAX_ATTEMPTS }, OR: [
      { status: "queued" }, { status: "running", startedAt: { lt: new Date(now.getTime() - LEASE_MS) } },
    ] }, data: { status: "failed", finishedAt: now, error: "summary_generation_failed" },
  });
  const claimed = await prisma.courseSessionSummaryGeneration.updateMany({
    where: { sessionId, attempts: { lt: MAX_ATTEMPTS }, OR: [
      { status: "queued", nextAttemptAt: { lte: now } },
      { status: "running", startedAt: { lt: new Date(now.getTime() - LEASE_MS) } },
    ] },
    data: { status: "running", requestId: runId, startedAt: now, finishedAt: null, error: null, attempts: { increment: 1 } },
  });
  if (!claimed.count) return false;
  const job = await prisma.courseSessionSummaryGeneration.findUniqueOrThrow({ where: { sessionId } });
  try {
    await generateCourseSessionSummary(job.courseId, sessionId, job.requestedBy, { totalTimeoutMs });
    await prisma.courseSessionSummaryGeneration.updateMany({
      where: { sessionId, requestId: runId, status: "running" },
      data: { status: "completed", finishedAt: new Date(), error: null },
    });
  } catch (error) {
    // Store a stable public error code; provider/database messages stay out of the UI.
    await prisma.courseSessionSummaryGeneration.updateMany({
      where: { sessionId, requestId: runId, status: "running" },
      data: { status: "failed", finishedAt: new Date(), error: "summary_generation_failed", nextAttemptAt: new Date(Date.now() + 30_000 * job.attempts) },
    });
    console.error("[course-summary] background generation failed", { sessionId, name: error instanceof Error ? error.name : "UnknownError" });
  }
  return true;
}

/** Select only missing/stale summaries; completed old drafts cannot starve newer lessons. */
export async function reconcileCourseSessionSummaryGenerations(limit = 25, maxRunMs = 240_000) {
  const deadline = Date.now() + maxRunMs;
  const lessons = await prisma.$queryRaw<Array<{ id: string; courseId: string }>>`
    SELECT lesson."id", lesson."courseId" FROM "CourseSession" lesson
    LEFT JOIN "CourseSessionSummary" summary ON summary."sessionId" = lesson."id"
    LEFT JOIN "CourseSessionSummaryGeneration" job ON job."sessionId" = lesson."id"
    WHERE lesson."status" IN ('afterClass', 'finished')
      AND EXISTS (SELECT 1 FROM "ClassroomCaption" c WHERE c."sessionId" = lesson."id" AND c."isFinal" = true)
      AND (summary."id" IS NULL OR (summary."status" = 'draft' AND summary."generatedBy" = 'system' AND (
        summary."captionCount" <> (SELECT COUNT(*) FROM "ClassroomCaption" c WHERE c."sessionId" = lesson."id" AND c."isFinal" = true)
        OR EXISTS (SELECT 1 FROM "ClassroomCaption" c WHERE c."sessionId" = lesson."id" AND c."isFinal" = true AND (summary."sourceUpdatedAt" IS NULL OR c."updatedAt" > summary."sourceUpdatedAt"))
      )))
      AND (job."sessionId" IS NULL OR job."status" = 'completed'
        OR (job."status" = 'failed' AND job."attempts" < ${MAX_ATTEMPTS} AND job."nextAttemptAt" <= NOW()))
    ORDER BY lesson."endTime" ASC, lesson."id" ASC LIMIT ${limit}
  `;
  for (const lesson of lessons) await queueCourseSessionSummary(lesson.courseId, lesson.id);
  const pending = await prisma.courseSessionSummaryGeneration.findMany({
    where: { OR: [
      { status: "queued", nextAttemptAt: { lte: new Date() } },
      { status: "running", startedAt: { lt: new Date(Date.now() - LEASE_MS) } },
      { status: "failed", attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: new Date() } },
    ] }, orderBy: { createdAt: "asc" }, take: limit,
  });
  let processed = 0;
  for (const job of pending) {
    const remaining = deadline - Date.now();
    if (remaining < 5_000) break;
    if (job.status === "failed" && !await queueCourseSessionSummary(job.courseId, job.sessionId, job.requestedBy)) {
      // A teacher may have reviewed the summary while this attempt failed.
      await prisma.courseSessionSummaryGeneration.updateMany({ where: { sessionId: job.sessionId, requestId: job.requestId, status: "failed" }, data: { status: "completed", error: null } });
      continue;
    }
    if (await processCourseSessionSummaryGeneration(job.sessionId, Math.min(240_000, remaining))) processed++;
  }
  return processed;
}
