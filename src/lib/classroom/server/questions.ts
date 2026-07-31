import "server-only";

import { classroomModePolicy } from "@/lib/classroom/mode";
import { ensureClassroomRuntime } from "@/lib/classroom/server/runtime";
import type {
  ClassroomQuestionSnapshot,
  ClassroomRole,
} from "@/lib/classroom/types";
import { prisma } from "@/lib/db";

export class ClassroomQuestionError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "ClassroomQuestionError";
  }
}

type QuestionRecord = {
  id: string;
  spaceId: string | null;
  askerId: string;
  askerName: string;
  content: string;
  status: string;
  answer: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  space: { name: string } | null;
};

function publicQuestion(question: QuestionRecord): ClassroomQuestionSnapshot {
  return {
    id: question.id,
    spaceId: question.spaceId,
    spaceName: question.space?.name ?? null,
    askerId: question.askerId,
    askerName: question.askerName,
    content: question.content,
    status:
      question.status === "promoted" ||
      question.status === "answered" ||
      question.status === "dismissed"
        ? question.status
        : "open",
    answer: question.answer,
    createdAt: question.createdAt.toISOString(),
    resolvedAt: question.resolvedAt?.toISOString() ?? null,
  };
}

async function assignedSpaceIds(sessionId: string, userId: string) {
  const memberships = await prisma.classroomSpaceMember.findMany({
    where: { sessionId, userId, active: true },
    select: { spaceId: true },
  });
  return memberships.map((membership) => membership.spaceId);
}

export async function getClassroomQuestions(input: {
  courseId: string;
  sessionId?: string;
  viewerId: string;
  role: ClassroomRole;
}) {
  const sessionId = input.sessionId || input.courseId;
  const spaces =
    input.role === "teacher"
      ? []
      : await assignedSpaceIds(sessionId, input.viewerId);
  const where =
    input.role === "teacher"
      ? { sessionId }
      : input.role === "assistant"
        ? {
            sessionId,
            OR: [
              { spaceId: { in: spaces } },
              { status: { in: ["promoted", "answered"] } },
            ],
          }
        : {
            sessionId,
            OR: [
              { askerId: input.viewerId },
              { status: { in: ["promoted", "answered"] } },
            ],
          };
  const questions = await prisma.classroomQuestion.findMany({
    where,
    include: { space: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return questions.map(publicQuestion);
}

export async function createClassroomQuestion(input: {
  courseId: string;
  sessionId?: string;
  askerId: string;
  askerName: string;
  role: ClassroomRole;
  content: string;
  requestedSpaceId?: string | null;
}) {
  const sessionId = input.sessionId || input.courseId;
  if (input.role === "teacher") {
    throw new ClassroomQuestionError("主讲老师无需提交课堂提问", 409);
  }
  const content = input.content.trim();
  if (!content || content.length > 500) {
    throw new ClassroomQuestionError("提问长度应为 1–500 个字符");
  }
  const lesson = await prisma.courseSession.findFirst({
    where: { id: sessionId, courseId: input.courseId },
    select: { roomType: true },
  });
  if (!lesson || !classroomModePolicy(lesson.roomType).showPublicQuestions) {
    throw new ClassroomQuestionError("当前课堂模式未开放提问", 409);
  }
  const spaces = await assignedSpaceIds(sessionId, input.askerId);
  const spaceId = input.requestedSpaceId || spaces[0] || null;
  if (spaceId && !spaces.includes(spaceId)) {
    throw new ClassroomQuestionError("你未被分配到该分组教室", 403);
  }
  const runtime = await ensureClassroomRuntime(input.courseId, sessionId);
  const [question, updated] = await prisma.$transaction([
    prisma.classroomQuestion.create({
      data: {
        courseId: input.courseId,
        sessionId,
        spaceId,
        askerId: input.askerId,
        askerName: input.askerName,
        content,
      },
      include: { space: { select: { name: true } } },
    }),
    prisma.classroomRuntime.update({
      where: { id: runtime.id },
      data: { revision: { increment: 1 } },
      select: { revision: true },
    }),
  ]);
  return { question: publicQuestion(question), revision: updated.revision };
}

export async function updateClassroomQuestion(input: {
  courseId: string;
  sessionId?: string;
  actorId: string;
  role: ClassroomRole;
  questionId: string;
  action: "promote" | "answer" | "dismiss" | "reopen";
  answer?: string;
}) {
  const sessionId = input.sessionId || input.courseId;
  if (input.role === "student") {
    throw new ClassroomQuestionError("只有教师可以处理课堂提问", 403);
  }
  const question = await prisma.classroomQuestion.findFirst({
    where: { id: input.questionId, sessionId },
  });
  if (!question) throw new ClassroomQuestionError("课堂提问不存在", 404);
  if (input.role === "assistant") {
    const assigned = question.spaceId
      ? await prisma.classroomSpaceMember.findFirst({
          where: {
            sessionId,
            spaceId: question.spaceId,
            userId: input.actorId,
            role: "assistant",
            active: true,
          },
        })
      : null;
    if (!assigned) {
      throw new ClassroomQuestionError("助教只能处理所属教室的提问", 403);
    }
  }
  const answer = input.answer?.trim() || null;
  if (input.action === "answer" && !answer) {
    throw new ClassroomQuestionError("请输入回答内容");
  }
  const data =
    input.action === "promote"
      ? { status: "promoted", promotedBy: input.actorId }
      : input.action === "answer"
        ? {
            status: "answered",
            answer,
            answeredBy: input.actorId,
            resolvedAt: new Date(),
          }
        : input.action === "dismiss"
          ? { status: "dismissed", resolvedAt: new Date() }
          : {
              status: "open",
              answer: null,
              answeredBy: null,
              resolvedAt: null,
            };
  const runtime = await ensureClassroomRuntime(input.courseId, sessionId);
  const [updated, revision] = await prisma.$transaction([
    prisma.classroomQuestion.update({
      where: { id: question.id },
      data,
      include: { space: { select: { name: true } } },
    }),
    prisma.classroomRuntime.update({
      where: { id: runtime.id },
      data: { revision: { increment: 1 } },
      select: { revision: true },
    }),
  ]);
  return { question: publicQuestion(updated), revision: revision.revision };
}
