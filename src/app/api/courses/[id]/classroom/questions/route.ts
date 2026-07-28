import { NextRequest, NextResponse } from "next/server";
import {
  ClassroomQuestionError,
  createClassroomQuestion,
  getClassroomQuestions,
  updateClassroomQuestion,
} from "@/lib/classroom/server/questions";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function access(request: NextRequest, courseId: string, shareAccess?: string | null) {
  return resolveClassroomRequestAccess(request, courseId, shareAccess);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const resolved = await access(
    request,
    courseId,
    request.nextUrl.searchParams.get("shareAccess"),
  );
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  return NextResponse.json({
    questions: await getClassroomQuestions({
      courseId,
      viewerId: resolved.session.userId,
      role: resolved.access.role,
    }),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as {
    content?: unknown;
    spaceId?: unknown;
    shareAccess?: unknown;
  } | null;
  const resolved = await access(
    request,
    courseId,
    typeof body?.shareAccess === "string" ? body.shareAccess : null,
  );
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  try {
    return NextResponse.json(
      await createClassroomQuestion({
        courseId,
        askerId: resolved.session.userId,
        askerName:
          resolved.session.displayName || resolved.session.name || resolved.session.userId,
        role: resolved.access.role,
        content: typeof body?.content === "string" ? body.content : "",
        requestedSpaceId: typeof body?.spaceId === "string" ? body.spaceId : null,
      }),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ClassroomQuestionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[classroom:questions] create failed", error);
    return NextResponse.json({ error: "提交提问失败" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as {
    questionId?: unknown;
    action?: unknown;
    answer?: unknown;
    shareAccess?: unknown;
  } | null;
  const resolved = await access(
    request,
    courseId,
    typeof body?.shareAccess === "string" ? body.shareAccess : null,
  );
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const action = body?.action;
  if (
    action !== "promote" &&
    action !== "answer" &&
    action !== "dismiss" &&
    action !== "reopen"
  ) {
    return NextResponse.json({ error: "不支持的提问操作" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await updateClassroomQuestion({
        courseId,
        actorId: resolved.session.userId,
        role: resolved.access.role,
        questionId: typeof body?.questionId === "string" ? body.questionId : "",
        action,
        answer: typeof body?.answer === "string" ? body.answer : undefined,
      }),
    );
  } catch (error) {
    if (error instanceof ClassroomQuestionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[classroom:questions] update failed", error);
    return NextResponse.json({ error: "处理提问失败" }, { status: 500 });
  }
}
