import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import {
  resolveStudentSubmissionMember,
  serializeStudentSubmission,
  sessionAcceptsStudentSubmission,
  STUDENT_LEAVE_REASON_MAX_LENGTH,
  STUDENT_REQUIREMENTS_MAX_LENGTH,
} from "@/lib/course-session-submission";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ sessionId: string }> };

async function resolveStudent(request: NextRequest, context: Context) {
  const auth = await getSessionFromRequest(request);
  if (!auth) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { sessionId } = await context.params;
  const membership = await resolveStudentSubmissionMember(
    sessionId,
    auth.userId,
    auth.name || "",
  );
  if (!membership.ok) {
    return {
      error: NextResponse.json(
        { error: membership.error },
        { status: membership.status },
      ),
    };
  }
  const lesson = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      courseId: true,
      status: true,
      endTime: true,
      endedAt: true,
    },
  });
  if (!lesson) {
    return { error: NextResponse.json({ error: "课次不存在" }, { status: 404 }) };
  }
  return { auth, lesson, student: membership.student };
}

export async function GET(request: NextRequest, context: Context) {
  const resolved = await resolveStudent(request, context);
  if ("error" in resolved) return resolved.error;
  const submission = await prisma.courseSessionStudentSubmission.findUnique({
    where: {
      sessionId_studentId: {
        sessionId: resolved.lesson.id,
        studentId: resolved.student.userId,
      },
    },
  });
  return NextResponse.json(
    {
      submission: serializeStudentSubmission(submission),
      editable: sessionAcceptsStudentSubmission(resolved.lesson),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: NextRequest, context: Context) {
  const resolved = await resolveStudent(request, context);
  if ("error" in resolved) return resolved.error;
  if (!sessionAcceptsStudentSubmission(resolved.lesson)) {
    return NextResponse.json(
      { error: "已结束或已取消的课次不能修改请假和课堂要求" },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    requirements?: unknown;
    leaveAction?: unknown;
    leaveReason?: unknown;
  };
  const requirements =
    typeof body.requirements === "string" ? body.requirements.trim() : undefined;
  const hasRequirements = requirements !== undefined;
  const leaveAction =
    body.leaveAction === "request" || body.leaveAction === "withdraw"
      ? body.leaveAction
      : null;
  if (!hasRequirements && !leaveAction) {
    return NextResponse.json({ error: "没有可保存的内容" }, { status: 400 });
  }
  const leaveReason =
    typeof body.leaveReason === "string" ? body.leaveReason.trim() : "";
  if (
    requirements !== undefined &&
    requirements.length > STUDENT_REQUIREMENTS_MAX_LENGTH
  ) {
    return NextResponse.json({ error: "本节课要求不能超过 1000 字" }, { status: 400 });
  }
  if (leaveReason.length > STUDENT_LEAVE_REASON_MAX_LENGTH) {
    return NextResponse.json({ error: "请假原因不能超过 500 字" }, { status: 400 });
  }

  const now = new Date();
  const update = {
    ...(requirements !== undefined ? { requirements } : {}),
    ...(leaveAction === "request"
      ? {
          leaveStatus: "active",
          leaveReason,
          leaveRequestedAt: now,
          leaveWithdrawnAt: null,
        }
      : leaveAction === "withdraw"
        ? {
            leaveStatus: "withdrawn",
            leaveWithdrawnAt: now,
          }
        : {}),
  };
  const submission = await prisma.courseSessionStudentSubmission.upsert({
    where: {
      sessionId_studentId: {
        sessionId: resolved.lesson.id,
        studentId: resolved.student.userId,
      },
    },
    create: {
      courseId: resolved.lesson.courseId,
      sessionId: resolved.lesson.id,
      studentId: resolved.student.userId,
      studentName: resolved.student.displayName,
      studentAvatar: resolved.student.avatar,
      ...update,
    },
    update: {
      studentName: resolved.student.displayName,
      studentAvatar: resolved.student.avatar,
      ...update,
    },
  });

  return NextResponse.json({ submission: serializeStudentSubmission(submission) });
}
