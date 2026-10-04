import { normalizeParentOrigin } from "@/lib/classroom/integration-events";

export class PublicApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "PublicApiError";
  }
}

type JsonObject = Record<string, unknown>;

function invalid(message: string): never {
  throw new PublicApiError(400, "invalid_request", message);
}

export function objectInput(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("Body must be a JSON object");
  return value as JsonObject;
}

function allowedFields(body: JsonObject, fields: string[]) {
  const unknown = Object.keys(body).find((key) => !fields.includes(key));
  if (unknown) invalid(`Unknown field: ${unknown}`);
}

function text(body: JsonObject, key: string, max: number, required = false): string | undefined {
  if (body[key] === undefined && !required) return undefined;
  if (typeof body[key] !== "string") return invalid(`${key} must be a string`);
  const value = (body[key] as string).trim();
  if (value.length > max || (required && !value)) return invalid(`${key} must contain ${required ? "1" : "0"} to ${max} characters`);
  return value;
}

function roomType(body: JsonObject): number | undefined {
  if (body.roomType === undefined) return undefined;
  if (typeof body.roomType !== "number" || ![0, 2, 4, 10].includes(body.roomType)) return invalid("roomType must be 0, 2, 4 or 10");
  return body.roomType;
}

export type PublicCourseInput = {
  name?: string;
  description?: string;
  studentRemarks?: string;
  roomType?: number;
  autoStudentOnStage?: boolean;
  courseKind?: "series" | "standalone";
  ownerId?: string;
  ownerName?: string;
  teacherId?: string;
  teacherName?: string;
};

export function parsePublicCourse(value: unknown, creating: boolean): PublicCourseInput {
  const body = objectInput(value);
  const fields = ["name", "description", "studentRemarks", "roomType", "autoStudentOnStage"];
  if (creating) fields.push("courseKind", "ownerId", "ownerName", "teacherId", "teacherName");
  allowedFields(body, fields);
  const result: PublicCourseInput = {};
  const name = text(body, "name", 200, creating || body.name !== undefined);
  if (name !== undefined) result.name = name;
  for (const key of ["description", "studentRemarks"] as const) {
    const value = text(body, key, 10_000);
    if (value !== undefined) result[key] = value;
  }
  const room = roomType(body);
  if (room !== undefined) result.roomType = room;
  if (body.autoStudentOnStage !== undefined) {
    if (typeof body.autoStudentOnStage !== "boolean") invalid("autoStudentOnStage must be a boolean");
    result.autoStudentOnStage = body.autoStudentOnStage as boolean;
  }
  if (creating) {
    result.ownerId = text(body, "ownerId", 200, true);
    result.ownerName = text(body, "ownerName", 200);
    result.teacherId = text(body, "teacherId", 200, body.teacherId !== undefined);
    result.teacherName = text(body, "teacherName", 200);
    if (body.courseKind !== undefined && body.courseKind !== "series" && body.courseKind !== "standalone") invalid("courseKind must be series or standalone");
    result.courseKind = body.courseKind as PublicCourseInput["courseKind"];
  }
  if (!creating && !Object.keys(result).length) invalid("At least one editable field is required");
  return result;
}

export type PublicSessionInput = {
  title?: string;
  startTime?: Date;
  endTime?: Date;
  roomType?: number;
  students?: { userId: string; displayName: string }[];
};

export type PublicJoinLinkInput = {
  label?: string; parentOrigin?: string; lang?: string;
  requirePasscode?: boolean; passcode?: string; expiresAt?: Date;
};

export function parsePublicJoinLink(value: unknown): PublicJoinLinkInput {
  const body = objectInput(value);
  allowedFields(body, ["label", "parentOrigin", "lang", "requirePasscode", "passcode", "expiresAt"]);
  const result: PublicJoinLinkInput = {};
  for (const [key, max] of [["label", 200], ["lang", 20], ["passcode", 6]] as const) {
    const value = text(body, key, max, body[key] !== undefined && key !== "label");
    if (value !== undefined) result[key] = value;
  }
  if (body.requirePasscode !== undefined) {
    if (typeof body.requirePasscode !== "boolean") invalid("requirePasscode must be a boolean");
    result.requirePasscode = body.requirePasscode;
  }
  if (result.passcode && (!/^\d{6}$/.test(result.passcode) || result.requirePasscode === false)) invalid("passcode must be 6 digits and requirePasscode cannot be false");
  const origin = text(body, "parentOrigin", 2000, body.parentOrigin !== undefined);
  if (origin !== undefined) {
    const normalized = normalizeParentOrigin(origin);
    if (!normalized || normalized !== origin.replace(/\/$/, "")) invalid("parentOrigin must be an exact HTTP(S) origin without a path");
    result.parentOrigin = normalized;
  }
  const expiresAt = date(body, "expiresAt", false);
  if (expiresAt && expiresAt <= new Date()) invalid("expiresAt must be in the future");
  if (expiresAt) result.expiresAt = expiresAt;
  return result;
}

function date(body: JsonObject, key: string, required: boolean) {
  const value = text(body, key, 40, required);
  if (value === undefined) return undefined;
  // Require an explicit timezone to avoid interpreting a partner's local time
  // in the timezone of the deployment host.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) invalid(`${key} must be an ISO 8601 timestamp with timezone`);
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || (value[16] === ":" && Number(value.slice(17, 19)) > 59)) invalid(`${key} is invalid`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) invalid(`${key} is invalid`);
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) invalid(`${key} is invalid`);
  return parsed;
}

export function parsePublicSession(value: unknown, creating: boolean): PublicSessionInput {
  const body = objectInput(value);
  allowedFields(body, ["title", "startTime", "endTime", "roomType", "students"]);
  const result: PublicSessionInput = {};
  const title = text(body, "title", 200, body.title !== undefined);
  if (title !== undefined) result.title = title;
  const start = date(body, "startTime", creating), end = date(body, "endTime", creating);
  if (start) result.startTime = start;
  if (end) result.endTime = end;
  if (start && end && end <= start) invalid("endTime must be after startTime");
  const room = roomType(body);
  if (room !== undefined) result.roomType = room;
  if (body.students !== undefined) {
    if (!Array.isArray(body.students) || body.students.length > 100) invalid("students must be an array with at most 100 users");
    const seen = new Set<string>();
    result.students = (body.students as unknown[]).map((item) => {
      const student = objectInput(item);
      allowedFields(student, ["userId", "displayName"]);
      const userId = text(student, "userId", 200, true)!;
      if (seen.has(userId)) invalid("students contains duplicate userId");
      seen.add(userId);
      return { userId, displayName: text(student, "displayName", 200) || userId };
    });
  }
  if (!creating && !Object.keys(result).length) invalid("At least one editable field is required");
  return result;
}

export function publicIdempotencyKey(headers: Headers) {
  const value = headers.get("idempotency-key");
  if (value === null) return undefined;
  if (!/^[\x21-\x7e]{1,160}$/.test(value)) invalid("Idempotency-Key must contain 1 to 160 printable ASCII characters without spaces");
  return value;
}

export function publicPage(search: URLSearchParams) {
  const raw = search.get("limit") ?? "20";
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) invalid("limit must be between 1 and 100");
  const after = search.get("after") || undefined;
  if (after && !/^[a-zA-Z0-9-]{1,100}$/.test(after)) invalid("Invalid after cursor");
  const ownerId = search.get("ownerId") || undefined;
  if (ownerId && ownerId.length > 200) invalid("ownerId is too long");
  return { limit: Number(raw), after, ownerId };
}

export async function readPublicJson(request: Request): Promise<unknown> {
  const max = 64 * 1024;
  if ((request.headers.get("content-type") || "").toLowerCase().split(";")[0].trim() !== "application/json") throw new PublicApiError(415, "unsupported_media_type", "Content-Type must be application/json");
  const length = request.headers.get("content-length");
  if (length && Number(length) > max) throw new PublicApiError(413, "body_too_large", "Body exceeds 64 KiB");
  if (!request.body) invalid("JSON body is required");
  const reader = request.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new PublicApiError(413, "body_too_large", "Body exceeds 64 KiB");
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return invalid("Invalid JSON body"); }
}
