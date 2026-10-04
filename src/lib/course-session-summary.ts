import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  buildCourseSessionSummaryDocument,
  normalizeCourseSessionSummaryDocument,
} from "@/lib/course-session-summary-document";
import { generateCourseSessionAISummary } from "@/lib/course-session-ai-summary";

export {
  buildCourseSessionSummaryDocument,
  normalizeCourseSessionSummaryDocument,
} from "@/lib/course-session-summary-document";
export type { CourseSessionSummaryDocument } from "@/lib/course-session-summary-document";

export function publicCourseSessionSummary(summary: {
  id: string;
  sessionId: string;
  status: string;
  document: unknown;
  captionCount: number;
  sourceUpdatedAt: Date | null;
  generatedBy: string;
  generatedAt: Date;
  publishedAt: Date | null;
  updatedAt: Date;
}) {
  const document = normalizeCourseSessionSummaryDocument(summary.document);
  return {
    id: summary.id,
    sessionId: summary.sessionId,
    status: summary.status === "published" ? "published" : "draft",
    document,
    captionCount: summary.captionCount,
    sourceUpdatedAt: summary.sourceUpdatedAt?.toISOString() ?? null,
    generatedBy: summary.generatedBy,
    generatedAt: summary.generatedAt.toISOString(),
    publishedAt: summary.publishedAt?.toISOString() ?? null,
    updatedAt: summary.updatedAt.toISOString(),
    isStale: Boolean(summary.sourceUpdatedAt && summary.sourceUpdatedAt > summary.generatedAt),
  };
}

export async function generateCourseSessionSummary(
  courseId: string,
  sessionId: string,
  generatedBy = "system",
) {
  const lesson = await prisma.courseSession.findFirst({
    where: { id: sessionId, courseId },
    select: { id: true, title: true, course: { select: { name: true } } },
  });
  if (!lesson) throw new Error("Course session not found");
  const captions = await prisma.classroomCaption.findMany({
    where: { sessionId, courseId, isFinal: true },
    select: { id: true, speakerId: true, speakerName: true, text: true, occurredAt: true, updatedAt: true },
    orderBy: { occurredAt: "asc" },
  });
  const title = lesson.title || lesson.course.name;
  const fallbackDocument = buildCourseSessionSummaryDocument(title, captions);
  let document = fallbackDocument;
  try {
    document = await generateCourseSessionAISummary({
      title,
      captions,
      fallback: fallbackDocument,
    }) || fallbackDocument;
    document = normalizeCourseSessionSummaryDocument(document, fallbackDocument);
  } catch (error) {
    console.warn("[course-summary] AI generation failed; using deterministic fallback", {
      courseId,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const sourceUpdatedAt = captions.reduce<Date | null>(
    (latest, caption) => !latest || caption.updatedAt > latest ? caption.updatedAt : latest,
    null,
  );
  return prisma.courseSessionSummary.upsert({
    where: { sessionId },
    create: {
      courseId, sessionId, status: "draft",
      document: document as unknown as Prisma.InputJsonValue,
      captionCount: captions.length, sourceUpdatedAt, generatedBy, generatedAt: new Date(), publishedAt: null,
    },
    update: {
      status: "draft", document: document as unknown as Prisma.InputJsonValue,
      captionCount: captions.length, sourceUpdatedAt, generatedBy, generatedAt: new Date(), publishedAt: null,
    },
  });
}

/**
 * Durable cron fallback for an interrupted post-class callback and for final
 * captions that arrive shortly after the lesson ended.
 */
export async function reconcileCourseSessionSummaries(limit = 25) {
  const lessons = await prisma.courseSession.findMany({
    where: {
      status: { in: ["afterClass", "finished"] },
      classroomCaptions: { some: { isFinal: true } },
      OR: [
        { summary: { is: null } },
        { summary: { is: { status: "draft", generatedBy: "system" } } },
      ],
    },
    select: {
      id: true,
      courseId: true,
      summary: { select: { captionCount: true, sourceUpdatedAt: true } },
      classroomCaptions: {
        where: { isFinal: true },
        select: { updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      _count: { select: { classroomCaptions: { where: { isFinal: true } } } },
    },
    orderBy: { endTime: "asc" },
    take: limit,
  });
  let reconciled = 0;
  for (const lesson of lessons) {
    const latestCaptionAt = lesson.classroomCaptions[0]?.updatedAt || null;
    const alreadyCurrent =
      lesson.summary &&
      lesson.summary.captionCount === lesson._count.classroomCaptions &&
      (!latestCaptionAt ||
        (lesson.summary.sourceUpdatedAt &&
          lesson.summary.sourceUpdatedAt >= latestCaptionAt));
    if (alreadyCurrent) continue;
    await generateCourseSessionSummary(lesson.courseId, lesson.id, "system");
    reconciled += 1;
  }
  return reconciled;
}

export async function saveCourseSessionSummary(
  courseId: string,
  sessionId: string,
  documentInput: unknown,
  updatedBy: string,
) {
  const existing = await prisma.courseSessionSummary.findUnique({ where: { sessionId } });
  if (!existing || existing.courseId !== courseId) {
    throw new Error("Generate a lesson summary before editing it");
  }
  const document = normalizeCourseSessionSummaryDocument(
    documentInput,
    normalizeCourseSessionSummaryDocument(existing.document),
  );
  return prisma.courseSessionSummary.update({
    where: { sessionId },
    data: {
      document: document as unknown as Prisma.InputJsonValue,
      status: "draft", generatedBy: updatedBy, publishedAt: null,
    },
  });
}

export async function setCourseSessionSummaryPublished(
  courseId: string,
  sessionId: string,
  published: boolean,
) {
  const existing = await prisma.courseSessionSummary.findUnique({ where: { sessionId } });
  if (!existing || existing.courseId !== courseId) throw new Error("Lesson summary not found");
  return prisma.courseSessionSummary.update({
    where: { sessionId },
    data: { status: published ? "published" : "draft", publishedAt: published ? new Date() : null },
  });
}
