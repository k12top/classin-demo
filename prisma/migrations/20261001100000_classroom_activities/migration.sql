CREATE TABLE "ClassroomActivity" (
 "id" TEXT NOT NULL, "runtimeId" TEXT NOT NULL, "sessionId" TEXT NOT NULL,
 "requestId" TEXT NOT NULL, "createdBy" TEXT NOT NULL, "title" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "definition" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'draft',
 "version" INTEGER NOT NULL DEFAULT 1, "presented" BOOLEAN NOT NULL DEFAULT false, "presentedQuestion" INTEGER NOT NULL DEFAULT 0,
 "durationSec" INTEGER, "startedAt" TIMESTAMP(3), "deadlineAt" TIMESTAMP(3),
 "closedAt" TIMESTAMP(3), "publishedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ClassroomActivity_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ClassroomActivity_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "ClassroomRuntime"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClassroomActivity_sessionId_requestId_key" ON "ClassroomActivity"("sessionId", "requestId");
CREATE INDEX "ClassroomActivity_sessionId_createdAt_idx" ON "ClassroomActivity"("sessionId", "createdAt");
-- Authoritative guard even if a future caller forgets the runtime row lock.
CREATE UNIQUE INDEX "ClassroomActivity_one_active_per_session" ON "ClassroomActivity"("sessionId") WHERE "status" = 'active';
CREATE UNIQUE INDEX "ClassroomActivity_one_presented_per_session" ON "ClassroomActivity"("sessionId") WHERE "presented" = true;
CREATE TABLE "ClassroomActivitySubmission" (
 "id" TEXT NOT NULL, "activityId" TEXT NOT NULL, "userId" TEXT NOT NULL, "displayName" TEXT NOT NULL,
 "answers" JSONB NOT NULL, "grading" JSONB NOT NULL, "feedback" TEXT NOT NULL DEFAULT '',
 "version" INTEGER NOT NULL DEFAULT 1, "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ClassroomActivitySubmission_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ClassroomActivitySubmission_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ClassroomActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClassroomActivitySubmission_activityId_userId_key" ON "ClassroomActivitySubmission"("activityId", "userId");
CREATE INDEX "ClassroomActivitySubmission_activityId_id_idx" ON "ClassroomActivitySubmission"("activityId", "id");
