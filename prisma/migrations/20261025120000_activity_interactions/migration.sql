ALTER TABLE "ClassroomActivitySubmission" ADD COLUMN "answerHistory" JSONB NOT NULL DEFAULT '[]', ADD COLUMN "answerVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ClassroomActivitySubmission" ADD COLUMN "aiReview" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE "ClassroomActivityReminder" (
  "id" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "recipients" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassroomActivityReminder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClassroomActivityReminder_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ClassroomActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClassroomActivityReminder_activityId_requestId_key" ON "ClassroomActivityReminder"("activityId", "requestId");
CREATE INDEX "ClassroomActivityReminder_activityId_createdAt_idx" ON "ClassroomActivityReminder"("activityId", "createdAt");
