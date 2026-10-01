ALTER TABLE "ClassroomRuntime" ADD COLUMN "assistantPermissions" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE "ClassroomConnection" (
 "id" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "rtcUid" INTEGER NOT NULL, "screenUid" INTEGER NOT NULL,
 "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leftAt" TIMESTAMP(3)
);
CREATE INDEX "ClassroomConnection_sessionId_userId_lastSeenAt_idx" ON "ClassroomConnection"("sessionId", "userId", "lastSeenAt");
