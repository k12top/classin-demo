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
    if (!messages.length) return Response.json({ translations: {} }, { headers: { "Cache-Control": "no-store" } });
    // Model calls may take seconds. Recheck membership and the original text
    // before returning a cached or newly generated translation.
    const current = await resolveClassroomRequestAccess(request, sessionId, typeof body.shareAccess === "string" ? body.shareAccess : null);
    if (!current.ok) return Response.json({ error: current.error }, { status: current.status });
    if (current.session.userId !== access.session.userId || current.access.sessionId !== access.access.sessionId) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const visible = await prisma.classroomMessage.findMany({ where: { AND: [classroomMessageAccess(current.access.sessionId, current.session.userId, current.access.role), { id: { in: messages.map(message => message.id) }, deletedAt: null, kind: "text" }] }, select: { id: true, content: true } });
    const originals = new Map(messages.map(message => [message.id, message.content]));
    const authorized = Object.fromEntries(visible.filter(message => originals.get(message.id) === message.content && Object.hasOwn(translations, message.id)).map(message => [message.id, translations[message.id]]));
    return Response.json({ translations: authorized }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return databaseUnavailableResponse(error, { route: "classroom/messages/translate", sessionId, operation: "translate" }) || Response.json({ code: "translation_failed" }, { status: 503 }); }
}
