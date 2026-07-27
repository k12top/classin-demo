ALTER TABLE "Course"
ADD COLUMN "classroomProvider" TEXT NOT NULL DEFAULT 'agora',
ADD COLUMN "recordingProvider" TEXT NOT NULL DEFAULT 'agora';

CREATE TABLE "ClassroomRecording" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "recorderUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'starting',
    "resourceId" TEXT,
    "providerSessionId" TEXT,
    "playbackObjectKey" TEXT,
    "files" JSONB,
    "providerState" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomRecording_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClassroomRecording_courseId_idx"
ON "ClassroomRecording"("courseId");

CREATE INDEX "ClassroomRecording_courseId_status_idx"
ON "ClassroomRecording"("courseId", "status");

CREATE INDEX "ClassroomRecording_providerSessionId_idx"
ON "ClassroomRecording"("providerSessionId");

ALTER TABLE "ClassroomRecording"
ADD CONSTRAINT "ClassroomRecording_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
