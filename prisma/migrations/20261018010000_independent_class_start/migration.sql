-- New classrooms remind by default. Preserve explicitly configured legacy auto-start intent.
ALTER TABLE "ClassroomRuntime" ADD COLUMN "classStartMode" TEXT NOT NULL DEFAULT 'manual';
UPDATE "ClassroomRuntime" SET "classStartMode" = 'scheduled', "recordingStartMode" = 'classStart'
WHERE "recordingStartMode" IN ('scheduled', 'scheduledEarly');
