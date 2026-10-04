CREATE TABLE "ClassroomRewardEvent" (
    "id" TEXT NOT NULL,
    "runtimeId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "giverId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomRewardEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomEngagementRound" (
    "id" TEXT NOT NULL,
    "runtimeId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedById" TEXT NOT NULL,
    "winnerUserId" TEXT,
    "resultUserIds" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomEngagementRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomEngagementResponse" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomEngagementResponse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClassroomRewardEvent_sessionId_recipientId_idx" ON "ClassroomRewardEvent"("sessionId", "recipientId");
CREATE INDEX "ClassroomRewardEvent_runtimeId_createdAt_idx" ON "ClassroomRewardEvent"("runtimeId", "createdAt");
CREATE INDEX "ClassroomEngagementRound_sessionId_kind_status_idx" ON "ClassroomEngagementRound"("sessionId", "kind", "status");
CREATE INDEX "ClassroomEngagementRound_runtimeId_createdAt_idx" ON "ClassroomEngagementRound"("runtimeId", "createdAt");
CREATE UNIQUE INDEX "ClassroomEngagementResponse_roundId_userId_key" ON "ClassroomEngagementResponse"("roundId", "userId");
CREATE INDEX "ClassroomEngagementResponse_sessionId_respondedAt_idx" ON "ClassroomEngagementResponse"("sessionId", "respondedAt");

ALTER TABLE "ClassroomRewardEvent" ADD CONSTRAINT "ClassroomRewardEvent_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "ClassroomRuntime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomRewardEvent" ADD CONSTRAINT "ClassroomRewardEvent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomRewardEvent" ADD CONSTRAINT "ClassroomRewardEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomEngagementRound" ADD CONSTRAINT "ClassroomEngagementRound_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "ClassroomRuntime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomEngagementRound" ADD CONSTRAINT "ClassroomEngagementRound_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomEngagementRound" ADD CONSTRAINT "ClassroomEngagementRound_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomEngagementResponse" ADD CONSTRAINT "ClassroomEngagementResponse_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "ClassroomEngagementRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
