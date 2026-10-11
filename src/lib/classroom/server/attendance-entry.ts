import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

export function classroomAttendanceEntryId(sessionId: string, userId: string, clientId?: string) {
  if (!clientId) return randomUUID();
  const hash = createHash("sha256").update(JSON.stringify(["classroom-entry", sessionId, userId, clientId])).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** One tab's bootstrap retries cannot close or duplicate their own attendance. */
export async function recordClassroomAttendanceEntry(input: {
  courseId: string; sessionId: string; userId: string; displayName: string; avatar: string; clientId?: string;
}) {
  const id = classroomAttendanceEntryId(input.sessionId, input.userId, input.clientId);
  const now = new Date();
  // Close the previous entry and open this one atomically in a single query.
  // A competing callback skips the lock and retries once without tying up a connection.
  const record = async () => {
    const [result] = await prisma.$queryRaw<Array<{ locked: boolean; inserted: boolean }>>`
      WITH guard AS MATERIALIZED (
        SELECT pg_try_advisory_xact_lock(hashtext(${`attendance:${input.sessionId}`}), hashtext(${input.userId})) AS locked
      ), existing AS (
        SELECT "id" FROM "CourseAttendance" WHERE "id" = ${id}
      ), closed AS (
        UPDATE "CourseAttendance" SET "leftAt" = ${now},
          "durationSec" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz - "enteredAt"))))::integer
        WHERE "sessionId" = ${input.sessionId} AND "studentId" = ${input.userId} AND "leftAt" IS NULL
          AND (SELECT locked FROM guard) AND NOT EXISTS (SELECT 1 FROM existing)
        RETURNING "id"
      ), opened AS (
        INSERT INTO "CourseAttendance" ("id", "courseId", "sessionId", "studentId", "studentName", "studentAvatar", "enteredAt", "createdAt", "updatedAt", "durationSec")
        SELECT ${id}, ${input.courseId}, ${input.sessionId}, ${input.userId}, ${input.displayName}, ${input.avatar}, ${now}, ${now}, ${now}, 0
        FROM guard WHERE locked AND NOT EXISTS (SELECT 1 FROM existing) AND (SELECT COUNT(*) FROM closed) >= 0
        ON CONFLICT ("id") DO NOTHING RETURNING "id"
      ) SELECT (SELECT locked FROM guard) AS locked, EXISTS (SELECT 1 FROM opened) AS inserted
    `;
    return result;
  };
  let result = await record();
  if (!result?.locked) {
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
    result = await record();
  }
  if (!result?.locked) console.warn("[classroom:attendance] entry busy", { sessionId: input.sessionId, userId: input.userId, clientId: input.clientId });
  return result?.inserted === true;
}
