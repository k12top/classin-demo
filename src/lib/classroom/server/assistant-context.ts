import "server-only";
import { prisma } from "@/lib/db";
import { classroomModeFromRoomType } from "../mode";
import type { AssistantContext } from "./assistant";

type ActivityRow = {
  title: string; kind: string; status: string; deadlineAt: Date | null; presented: boolean;
  presentedQuestion: number; definition: unknown; ownAnswers: unknown; ownFeedback: string | null;
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" ? value : "";
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function activityContext(row: ActivityRow): NonNullable<AssistantContext["activities"]>[number] {
  const definition = record(row.definition);
  const questions = Array.isArray(definition.questions) ? definition.questions : [];
  const currentIndex = Math.max(0, Math.min(row.presentedQuestion, questions.length - 1));
  const indices = [...new Set([currentIndex, ...questions.map((_, index) => index)])].slice(0, 6);
  const own = record(row.ownAnswers);
  return {
    title: row.title, kind: row.kind, status: row.status, deadlineAt: row.deadlineAt?.toISOString() || null,
    presented: row.presented, currentQuestion: row.presented && questions.length ? currentIndex + 1 : null, questionCount: questions.length,
    questions: indices.flatMap(index => {
      const question = record(questions[index]);
      if (typeof question.prompt !== "string") return [];
      const answer = own[string(question.id)];
      return [{ number: index + 1, prompt: question.prompt,
        options: Array.isArray(question.options) ? question.options.map(option => ({ id: string(record(option).id), text: string(record(option).text) })) : [],
        ...(typeof answer === "string" || (Array.isArray(answer) && answer.every(item => typeof item === "string")) ? { ownAnswer: answer as string | string[] } : {}),
      }];
    }),
    ...(row.ownFeedback ? { ownFeedback: row.ownFeedback } : {}),
  };
}

async function assignedActivities(courseId: string, sessionId: string, viewerId: string) {
  // Activities may not be installed in an older deployment. Avoid depending on
  // its generated Prisma delegate or failing the whole Q&A before that migration.
  const tables = await prisma.$queryRaw<Array<{ available: boolean }>>`
    SELECT to_regclass('"ClassroomActivity"') IS NOT NULL
      AND to_regclass('"ClassroomActivitySubmission"') IS NOT NULL AS available`;
  if (!tables[0]?.available) return { available: false, activities: [] };
  const rows = await prisma.$queryRaw<ActivityRow[]>`
    SELECT a."title", a."kind", a."status", a."deadlineAt", a."presented", a."presentedQuestion", a."definition",
      s."answers" AS "ownAnswers", CASE WHEN a."status" = 'published' THEN s."feedback" ELSE NULL END AS "ownFeedback"
    FROM "ClassroomActivity" a JOIN "ClassroomRuntime" r ON r."id" = a."runtimeId"
    LEFT JOIN "ClassroomActivitySubmission" s ON s."activityId" = a."id" AND s."userId" = ${viewerId}
    WHERE a."sessionId" = ${sessionId} AND r."sessionId" = ${sessionId} AND r."courseId" = ${courseId}
      AND (a."status" IN ('active', 'closed', 'published') OR (a."status" = 'cancelled' AND a."startedAt" IS NOT NULL))
    ORDER BY a."presented" DESC, (a."status" = 'active') DESC, a."createdAt" DESC, a."id" DESC LIMIT 8`;
  return { available: true, activities: rows.map(activityContext) };
}

/** Load current, authorized lesson data afresh for every question. */
export async function loadClassroomAssistantContext(courseId: string, sessionId: string, viewerId: string): Promise<AssistantContext | null> {
  const [lesson, runtime, captions, assignmentCaptions, chat, summary, work] = await Promise.all([
    prisma.courseSession.findFirst({ where: { id: sessionId, courseId }, select: {
      title: true, position: true, status: true, roomType: true, startTime: true, endTime: true, leadTeacherName: true,
      course: { select: { name: true, description: true, teacherName: true } },
    } }),
    prisma.classroomRuntime.findFirst({ where: { sessionId, courseId }, select: { status: true, startedAt: true, sourceLanguage: true } }),
    prisma.classroomCaption.findMany({ where: { sessionId, courseId, isFinal: true }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 80, select: { speakerName: true, text: true, occurredAt: true } }),
    prisma.classroomCaption.findMany({ where: { sessionId, courseId, isFinal: true, OR: ["作业", "练习", "提交", "复习", "homework", "assignment", "due"].map(word => ({ text: { contains: word, mode: "insensitive" as const } })) },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 16, select: { speakerName: true, text: true, occurredAt: true } }),
    prisma.classroomMessage.findMany({ where: { sessionId, courseId, scope: "classroom", kind: "text", deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, select: { senderName: true, content: true, createdAt: true } }),
    prisma.courseSessionSummary.findFirst({ where: { sessionId, courseId, status: "published" }, select: { document: true, generatedAt: true } }),
    assignedActivities(courseId, sessionId, viewerId),
  ]);
  if (!lesson) return null;
  const document = record(summary?.document);
  const report = record(document.report);
  const actionItems = [...new Set([...strings(document.actionItems), ...(Array.isArray(report.actionItems) ? report.actionItems.map(action => {
    const item = record(action);
    return [string(item.title), string(item.owner), string(item.due), string(item.description)].filter(Boolean).join("；");
  }).filter(Boolean) : [])])];
  const transcript = (items: typeof captions) => items.reverse().map(caption => ({ ...caption, occurredAt: caption.occurredAt.toISOString() }));
  return {
    observedAt: new Date().toISOString(),
    title: lesson.title || lesson.course.name, description: lesson.course.description, teacherName: lesson.leadTeacherName || lesson.course.teacherName,
    lesson: { courseName: lesson.course.name, number: lesson.position, status: runtime?.status || lesson.status,
      mode: classroomModeFromRoomType(lesson.roomType), startTime: lesson.startTime.toISOString(), endTime: lesson.endTime.toISOString(),
      startedAt: runtime?.startedAt?.toISOString() || null, sourceLanguage: runtime?.sourceLanguage || "" },
    captions: transcript(captions), assignmentTranscript: transcript(assignmentCaptions),
    chat: chat.reverse().map(message => ({ speakerName: message.senderName, text: message.content, occurredAt: message.createdAt.toISOString() })),
    activitiesAvailable: work.available, activities: work.activities,
    ...(summary && { summary: { overview: string(document.overview), keyPoints: strings(document.keyPoints), actionItems, generatedAt: summary.generatedAt.toISOString() } }),
  };
}
