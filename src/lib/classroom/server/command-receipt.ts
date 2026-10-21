import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

export class ClassroomCommandConflict extends Error {
  readonly status = 409;
  constructor() { super("Command identifier was already used with different input or role"); }
}
export type ClassroomCommand = { sessionId: string; actorId: string; clientId?: string; role: string; commandId?: string; action: unknown };
export function validClassroomCommandId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])) : value;
}
function identity(input: ClassroomCommand) {
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  return { noticeId: `classroom-command:${hash([input.sessionId,input.actorId,input.clientId || "",input.commandId])}`, fingerprint: hash(canonical(input.action)) };
}
/** Call after current authorization, under the existing runtime row lock. */
export async function readClassroomCommand(tx: Prisma.TransactionClient, input: ClassroomCommand): Promise<Record<string, unknown> | null> {
  if (!input.commandId) return null;
  if (!validClassroomCommandId(input.commandId)) throw new ClassroomCommandConflict();
  const key=identity(input);
  const row=await tx.classroomProviderEvent.findUnique({where:{noticeId:key.noticeId}});
  if (!row) return null;
  const payload=row.payload as Record<string, unknown>;
  if (payload.fingerprint!==key.fingerprint || payload.role!==input.role) throw new ClassroomCommandConflict();
  return payload.result && typeof payload.result === "object" ? payload.result as Record<string, unknown> : {};
}
/** State mutation and receipt commit atomically. Never cache an uncommitted success. */
export async function saveClassroomCommand(tx: Prisma.TransactionClient, input: ClassroomCommand, result: object = {}) {
  if (!input.commandId) return;
  const key=identity(input);
  await tx.classroomProviderEvent.create({data:{noticeId:key.noticeId,provider:"classroom-command",category:"committed",processedAt:new Date(),payload:{fingerprint:key.fingerprint,role:input.role,result:result as Prisma.InputJsonObject}}});
}
