ALTER TABLE "ClassroomActivity" ADD COLUMN "answerReleaseScope" TEXT;
ALTER TABLE "ClassroomRuntime" ADD COLUMN "activityRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ClassroomActivity" ADD CONSTRAINT "ClassroomActivity_answerReleaseScope_check"
  CHECK ("answerReleaseScope" IS NULL OR "answerReleaseScope" IN ('answered', 'all'));
