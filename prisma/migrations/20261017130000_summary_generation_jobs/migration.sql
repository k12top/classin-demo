CREATE TABLE "CourseSessionSummaryGeneration" (
  "sessionId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "requestId" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL DEFAULT 'system',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseSessionSummaryGeneration_pkey" PRIMARY KEY ("sessionId"),
  CONSTRAINT "CourseSessionSummaryGeneration_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CourseSessionSummaryGeneration_status_nextAttemptAt_idx" ON "CourseSessionSummaryGeneration"("status", "nextAttemptAt");
