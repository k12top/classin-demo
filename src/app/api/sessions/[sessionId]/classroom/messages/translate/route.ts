import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { classroomMessageAccess } from "@/lib/classroom/server/message-access";
import { chatTranslationConfig, classroomMessageTranslations } from "@/lib/classroom/server/message-translation";
import { captionLanguageOptions } from "@/lib/classroom/languages";
import { databaseUnavailableResponse } from "@/lib/database-response";
import { classroomRedisCommand, classroomRedisEnabled } from "@/lib/classroom/server/redis";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.messageIds) || !body.messageIds.length || body.messageIds.length > 20 || body.messageIds.some((id: unknown) => typeof id !== "string" || id.length > 150) || !captionLanguageOptions("shengwang").some(item => item.code === body.language)) return Response.json({ error: "invalid_translation_request" }, { status: 400 });
  const { sessionId } = await params;
  if (classroomRedisEnabled() && await classroomRedisCommand(["PING"]) !== "PONG") return Response.json({ code: "translation_failed", retryable: true }, { status: 503 });
  try {
    const access = await resolveClassroomRequestAccess(request, sessionId, typeof body.shareAccess === "string" ? body.shareAccess : null);
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
    if (!chatTranslationConfig()) return Response.json({ code: "translation_unavailable" }, { status: 503 });
    const messages = await prisma.classroomMessage.findMany({ where: { AND: [classroomMessageAccess(access.access.sessionId, access.session.userId, access.access.role), { id: { in: [...new Set<string>(body.messageIds)] }, deletedAt: null, kind: "text" }] }, select: { id: true, content: true } });
    const translations = await classroomMessageTranslations(access.access.sessionId, messages, body.language);
    return Response.json({ translations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return databaseUnavailableResponse(error, { route: "classroom/messages/translate", sessionId, operation: "translate" }) || Response.json({ code: "translation_failed" }, { status: 503 }); }
}
