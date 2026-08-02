ALTER TABLE "ClassroomMemberState"
ADD COLUMN "screenShareState" TEXT NOT NULL DEFAULT 'idle',
ADD COLUMN "screenShareRequestedAt" TIMESTAMP(3);

CREATE INDEX "ClassroomMemberState_sessionId_screenShareState_idx"
ON "ClassroomMemberState"("sessionId", "screenShareState");
