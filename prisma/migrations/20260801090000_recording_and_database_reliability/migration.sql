-- Recording, transcription, and create-request reliability. All additions are
-- backwards compatible and preserve existing classroom data.
ALTER TABLE "Course"
  ADD COLUMN "creationRequestId" TEXT;

CREATE UNIQUE INDEX "Course_creationRequestId_key"
  ON "Course"("creationRequestId");

ALTER TABLE "ClassroomRecording"
  ADD COLUMN "startRetryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stopRetryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stopRequestedAt" TIMESTAMP(3),
  ADD COLUMN "lastProviderCheckAt" TIMESTAMP(3),
  ADD COLUMN "failureStage" TEXT,
  ADD COLUMN "playbackFormat" TEXT;

ALTER TABLE "ClassroomRuntime"
  ADD COLUMN "transcriptionRetryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "transcriptionLastCheckedAt" TIMESTAMP(3);

CREATE TABLE "ClassroomProviderEvent" (
  "id" TEXT NOT NULL,
  "noticeId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "recordingId" TEXT,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassroomProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassroomProviderEvent_noticeId_key"
  ON "ClassroomProviderEvent"("noticeId");
CREATE INDEX "ClassroomProviderEvent_recordingId_createdAt_idx"
  ON "ClassroomProviderEvent"("recordingId", "createdAt");
CREATE INDEX "ClassroomProviderEvent_provider_category_createdAt_idx"
  ON "ClassroomProviderEvent"("provider", "category", "createdAt");
