CREATE TABLE "ClassroomIntegrationEvent" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "claim" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassroomIntegrationEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClassroomIntegrationEvent_dedupeKey_key" ON "ClassroomIntegrationEvent"("dedupeKey");
CREATE INDEX "ClassroomIntegrationEvent_deliveredAt_nextAttemptAt_idx" ON "ClassroomIntegrationEvent"("deliveredAt", "nextAttemptAt");
CREATE INDEX "ClassroomIntegrationEvent_sessionId_createdAt_idx" ON "ClassroomIntegrationEvent"("sessionId", "createdAt");
