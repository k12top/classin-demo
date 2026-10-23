ALTER TABLE "ClassroomRuntime"
  ADD COLUMN "stageStudentLimit" INTEGER,
  ADD COLUMN "stageInviteBypassLimit" BOOLEAN NOT NULL DEFAULT true,
  ADD CONSTRAINT "ClassroomRuntime_stageStudentLimit_check"
    CHECK ("stageStudentLimit" IS NULL OR "stageStudentLimit" BETWEEN 1 AND 100);
