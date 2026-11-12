CREATE TABLE "ClassroomRemoteControlGrant" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "teacherClientId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "studentClientId" TEXT NOT NULL,
  "shareClaimId" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomRemoteControlGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClassroomRemoteControlGrant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClassroomRemoteControlGrant_state_check" CHECK ("state" IN ('requested', 'granted', 'rejected', 'revoked'))
);
CREATE UNIQUE INDEX "ClassroomRemoteControlGrant_sessionId_studentId_key" ON "ClassroomRemoteControlGrant"("sessionId", "studentId");
CREATE INDEX "ClassroomRemoteControlGrant_sessionId_teacherId_idx" ON "ClassroomRemoteControlGrant"("sessionId", "teacherId");
CREATE INDEX "ClassroomRemoteControlGrant_expiresAt_idx" ON "ClassroomRemoteControlGrant"("expiresAt");
