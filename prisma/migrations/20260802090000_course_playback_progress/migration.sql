CREATE TABLE "CoursePlaybackProgress" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL DEFAULT '',
    "studentAvatar" TEXT NOT NULL DEFAULT '',
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalDurationSec" INTEGER NOT NULL DEFAULT 0,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "activeSessionId" TEXT,
    "heartbeatNonceHash" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastPositionSec" DOUBLE PRECISION,
    "lastPlaybackRate" DOUBLE PRECISION,
    "lastPlaybackState" TEXT NOT NULL DEFAULT 'inactive',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePlaybackProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoursePlaybackProgress_courseId_studentId_key" ON "CoursePlaybackProgress"("courseId", "studentId");
CREATE INDEX "CoursePlaybackProgress_courseId_idx" ON "CoursePlaybackProgress"("courseId");
CREATE INDEX "CoursePlaybackProgress_studentId_idx" ON "CoursePlaybackProgress"("studentId");
CREATE INDEX "CoursePlaybackProgress_courseId_lastViewedAt_idx" ON "CoursePlaybackProgress"("courseId", "lastViewedAt");

ALTER TABLE "CoursePlaybackProgress" ADD CONSTRAINT "CoursePlaybackProgress_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
