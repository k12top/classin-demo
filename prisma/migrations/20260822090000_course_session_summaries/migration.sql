CREATE TABLE "CourseSessionSummary" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "document" JSONB NOT NULL DEFAULT '{}',
  "captionCount" INTEGER NOT NULL DEFAULT 0,
  "sourceUpdatedAt" TIMESTAMP(3),
  "generatedBy" TEXT NOT NULL DEFAULT 'system',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CourseSessionSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseSessionSummary_sessionId_key"
  ON "CourseSessionSummary"("sessionId");
CREATE INDEX "CourseSessionSummary_courseId_status_updatedAt_idx"
  ON "CourseSessionSummary"("courseId", "status", "updatedAt");
CREATE INDEX "CourseSessionSummary_sessionId_status_idx"
  ON "CourseSessionSummary"("sessionId", "status");

ALTER TABLE "CourseSessionSummary"
  ADD CONSTRAINT "CourseSessionSummary_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSessionSummary"
  ADD CONSTRAINT "CourseSessionSummary_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
