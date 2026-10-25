import { Prisma } from "@prisma/client";

/** Lock in the same order as extend/reopen, then re-read deadlines under READ COMMITTED. */
export async function lockDueLessons(tx: Prisma.TransactionClient, scope: { courseId?: { in: string[] } }, threshold: Date) {
  const where = { ...scope, status: { in: ["scheduled", "live", "afterClass"] }, endTime: { lte: threshold } };
  const select = { id: true, courseId: true, endTime: true, endedAt: true } as const;
  const candidates = await tx.courseSession.findMany({ where, select });
  const ids = candidates.map(lesson => lesson.id);
  if (!ids.length) return [];
  await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "CourseSession" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
  return tx.courseSession.findMany({ where: { ...where, id: { in: ids } }, select });
}
