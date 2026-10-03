-- Courseware was historically provisioned with db push and its create migration
-- was missing. Keep the checksums of deployed migrations unchanged. This new
-- prerequisite sorts before 20260728090000_classroom_v3_runtime, which extends
-- the table. Existing installations retain their table, rows and later columns.
CREATE TABLE IF NOT EXISTS "Courseware" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ext" TEXT NOT NULL,
  "size" INTEGER NOT NULL DEFAULT 0,
  "url" TEXT NOT NULL,
  "taskUuid" TEXT,
  "taskStatus" TEXT NOT NULL DEFAULT 'Pending',
  "type" TEXT NOT NULL DEFAULT 'static',
  "conversion" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Courseware_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Courseware_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Courseware_courseId_idx" ON "Courseware"("courseId");

-- These original Course fields also predate the checked-in migration history.
-- Nullable dates preserve the session rollout's existing createdAt fallback.
ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "startTime" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "endTime" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passcode" TEXT,
  ADD COLUMN IF NOT EXISTS "studentRemarks" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "recordUrl" TEXT;
