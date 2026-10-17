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
  options: { totalTimeoutMs?: number } = {},
) {
  const lesson = await prisma.courseSession.findFirst({
    where: { id: sessionId, courseId },
    select: { id: true, title: true, course: { select: { name: true } } },
  });
  if (!lesson) throw new Error("Course session not found");
  const existing = await prisma.courseSessionSummary.findUnique({ where: { sessionId } });
  if (generatedBy === "system" && existing && (existing.status === "published" || existing.generatedBy !== "system")) return existing;
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
    }, options) || fallbackDocument;
    document = normalizeCourseSessionSummaryDocument(document, fallbackDocument);
  } catch (error) {
    document = { ...fallbackDocument, generation: { ...fallbackDocument.generation!, reason: "unavailable" } };
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
  const data = {
    status: "draft", document: document as unknown as Prisma.InputJsonValue,
    captionCount: captions.length, sourceUpdatedAt, generatedBy, generatedAt: new Date(), publishedAt: null,
  };
  if (existing) {
    // Generation may take minutes: never overwrite teacher edits/publication
    // that happened while the model was analyzing the transcript.
    await prisma.courseSessionSummary.updateMany({ where: { id: existing.id, updatedAt: existing.updatedAt }, data });
    return prisma.courseSessionSummary.findUniqueOrThrow({ where: { sessionId } });
  }
  try {
    return await prisma.courseSessionSummary.create({ data: { courseId, sessionId, ...data } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return prisma.courseSessionSummary.findUniqueOrThrow({ where: { sessionId } });
    }
    throw error;
  }
}

/**
 * Durable cron fallback for an interrupted post-class callback and for final
 * captions that arrive shortly after the lesson ended.
 */
export async function reconcileCourseSessionSummaries(limit = 25, maxRunMs = 240_000) {
  const { reconcileCourseSessionSummaryGenerations } = await import("./course-session-summary-generation");
  return reconcileCourseSessionSummaryGenerations(limit, maxRunMs);
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
