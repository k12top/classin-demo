-- Matches the existing Prisma lookup index without modifying member rows.
CREATE INDEX IF NOT EXISTS "ClassroomMemberState_courseId_userId_idx" ON "ClassroomMemberState"("courseId", "userId");
