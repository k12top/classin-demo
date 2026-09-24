-- Repair a database where 20260728090000 was recorded as applied without all
-- of its objects and 20260729090000 stopped after adding sessionId columns.
-- This repair is intentionally additive and idempotent. It does not remove
-- application data or the legacy CoursePlaybackProgress table.

BEGIN;

ALTER TABLE "ClassroomRuntime"
  ADD COLUMN IF NOT EXISTS "interpretationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "interpretationProvider" TEXT NOT NULL DEFAULT 'shengwang',
  ADD COLUMN IF NOT EXISTS "sourceLanguage" TEXT NOT NULL DEFAULT 'zh-CN',
  ADD COLUMN IF NOT EXISTS "targetLanguages" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "transcriptionStatus" TEXT NOT NULL DEFAULT 'stopped',
  ADD COLUMN IF NOT EXISTS "transcriptionAgentId" TEXT,
  ADD COLUMN IF NOT EXISTS "transcriptionError" TEXT;

CREATE TABLE IF NOT EXISTS "ClassroomCaption" (
  "id" TEXT NOT NULL,
  "runtimeId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'shengwang',
  "speakerId" TEXT NOT NULL DEFAULT '',
  "speakerName" TEXT NOT NULL DEFAULT '',
  "sourceLanguage" TEXT NOT NULL DEFAULT '',
  "detectedLanguage" TEXT NOT NULL DEFAULT '',
  "text" TEXT NOT NULL,
  "translations" JSONB NOT NULL DEFAULT '{}',
  "isFinal" BOOLEAN NOT NULL DEFAULT false,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomCaption_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CourseJoinLink" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "Courseware" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "ClassroomRecording" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "CourseAttendance" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "ClassroomRuntime" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "ClassroomMemberState" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "ClassroomMessage" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "ClassroomSpace" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "ClassroomSpaceMember" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "ClassroomQuestion" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

-- Courses created while the migration was blocked may not have their legacy
-- default session. Recreate only the missing deterministic session rows.
INSERT INTO "CourseSession" (
  "id", "courseId", "title", "position", "roomUuid", "roomType",
  "classroomProvider", "recordingProvider", "leadTeacherId",
  "leadTeacherName", "leadTeacherAvatar", "status", "startTime", "endTime",
  "endedAt", "createdBy", "createdAt", "updatedAt"
)
SELECT
  c."id", c."id", c."name", 1,
  COALESCE(c."roomUuid", replace(c."id", '-', '')),
  c."roomType", c."classroomProvider", c."recordingProvider", c."teacherId",
  c."teacherName", c."teacherAvatar", c."status",
  COALESCE(c."startTime", c."createdAt"),
  COALESCE(c."endTime", c."startTime" + INTERVAL '1 hour', c."createdAt" + INTERVAL '1 hour'),
  c."endedAt", c."ownerId", c."createdAt", c."updatedAt"
FROM "Course" c
WHERE NOT EXISTS (
  SELECT 1 FROM "CourseSession" s WHERE s."courseId" = c."id"
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "CourseJoinLink"
SET "sessionId" = "courseId"
WHERE "sessionId" IS NULL AND "purpose" <> 'course';
UPDATE "ClassroomRecording" SET "sessionId" = "courseId" WHERE "sessionId" IS NULL;
UPDATE "CourseAttendance" SET "sessionId" = "courseId" WHERE "sessionId" IS NULL;
UPDATE "ClassroomRuntime" SET "sessionId" = "courseId" WHERE "sessionId" IS NULL;
UPDATE "ClassroomMemberState" SET "sessionId" = "courseId" WHERE "sessionId" IS NULL;
UPDATE "ClassroomMessage" SET "sessionId" = "courseId" WHERE "sessionId" IS NULL;
UPDATE "ClassroomSpace" SET "sessionId" = "courseId" WHERE "sessionId" IS NULL;
UPDATE "ClassroomSpaceMember" SET "sessionId" = "courseId" WHERE "sessionId" IS NULL;
UPDATE "ClassroomQuestion" SET "sessionId" = "courseId" WHERE "sessionId" IS NULL;

ALTER TABLE "ClassroomRecording" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "CourseAttendance" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "ClassroomRuntime" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "ClassroomMemberState" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "ClassroomMessage" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "ClassroomSpace" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "ClassroomSpaceMember" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "ClassroomQuestion" ALTER COLUMN "sessionId" SET NOT NULL;

DROP INDEX IF EXISTS "ClassroomRuntime_courseId_key";
DROP INDEX IF EXISTS "ClassroomMemberState_courseId_userId_key";
DROP INDEX IF EXISTS "ClassroomSpace_courseId_position_key";
DROP INDEX IF EXISTS "ClassroomCaption_courseId_externalId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "CourseSession_roomUuid_key" ON "CourseSession"("roomUuid");
CREATE UNIQUE INDEX IF NOT EXISTS "CourseSession_courseId_position_key" ON "CourseSession"("courseId", "position");
CREATE INDEX IF NOT EXISTS "CourseSession_courseId_startTime_idx" ON "CourseSession"("courseId", "startTime");
CREATE INDEX IF NOT EXISTS "CourseSession_courseId_status_idx" ON "CourseSession"("courseId", "status");
CREATE INDEX IF NOT EXISTS "CourseSession_seriesId_startTime_idx" ON "CourseSession"("seriesId", "startTime");
CREATE INDEX IF NOT EXISTS "CourseSession_leadTeacherId_startTime_idx" ON "CourseSession"("leadTeacherId", "startTime");
CREATE INDEX IF NOT EXISTS "CourseSessionSeries_courseId_idx" ON "CourseSessionSeries"("courseId");
CREATE UNIQUE INDEX IF NOT EXISTS "CourseSessionTeacher_sessionId_teacherId_key" ON "CourseSessionTeacher"("sessionId", "teacherId");
CREATE INDEX IF NOT EXISTS "CourseSessionTeacher_courseId_teacherId_idx" ON "CourseSessionTeacher"("courseId", "teacherId");
CREATE UNIQUE INDEX IF NOT EXISTS "CourseSessionStudent_sessionId_studentId_key" ON "CourseSessionStudent"("sessionId", "studentId");
CREATE INDEX IF NOT EXISTS "CourseSessionStudent_courseId_studentId_idx" ON "CourseSessionStudent"("courseId", "studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "CourseSessionGroupLink_sessionId_groupId_key" ON "CourseSessionGroupLink"("sessionId", "groupId");
CREATE INDEX IF NOT EXISTS "CourseSessionGroupLink_courseId_groupId_idx" ON "CourseSessionGroupLink"("courseId", "groupId");
CREATE UNIQUE INDEX IF NOT EXISTS "CourseSessionCourseware_sessionId_coursewareId_key" ON "CourseSessionCourseware"("sessionId", "coursewareId");
CREATE INDEX IF NOT EXISTS "CourseSessionCourseware_courseId_coursewareId_idx" ON "CourseSessionCourseware"("courseId", "coursewareId");
CREATE INDEX IF NOT EXISTS "CourseJoinLink_sessionId_idx" ON "CourseJoinLink"("sessionId");
CREATE INDEX IF NOT EXISTS "Courseware_sessionId_idx" ON "Courseware"("sessionId");
CREATE INDEX IF NOT EXISTS "ClassroomRecording_sessionId_idx" ON "ClassroomRecording"("sessionId");
CREATE INDEX IF NOT EXISTS "CourseAttendance_sessionId_idx" ON "CourseAttendance"("sessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "ClassroomRuntime_sessionId_key" ON "ClassroomRuntime"("sessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "ClassroomMemberState_sessionId_userId_key" ON "ClassroomMemberState"("sessionId", "userId");
CREATE INDEX IF NOT EXISTS "ClassroomMessage_sessionId_createdAt_idx" ON "ClassroomMessage"("sessionId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ClassroomCaption_sessionId_externalId_key" ON "ClassroomCaption"("sessionId", "externalId");
CREATE INDEX IF NOT EXISTS "ClassroomCaption_courseId_occurredAt_idx" ON "ClassroomCaption"("courseId", "occurredAt");
CREATE INDEX IF NOT EXISTS "ClassroomCaption_sessionId_occurredAt_idx" ON "ClassroomCaption"("sessionId", "occurredAt");
CREATE INDEX IF NOT EXISTS "ClassroomCaption_runtimeId_occurredAt_idx" ON "ClassroomCaption"("runtimeId", "occurredAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ClassroomSpace_sessionId_position_key" ON "ClassroomSpace"("sessionId", "position");
CREATE INDEX IF NOT EXISTS "ClassroomSpace_sessionId_status_idx" ON "ClassroomSpace"("sessionId", "status");
CREATE INDEX IF NOT EXISTS "ClassroomSpaceMember_sessionId_userId_idx" ON "ClassroomSpaceMember"("sessionId", "userId");
CREATE INDEX IF NOT EXISTS "ClassroomQuestion_sessionId_status_createdAt_idx" ON "ClassroomQuestion"("sessionId", "status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClassroomCaption_runtimeId_fkey') THEN
    ALTER TABLE "ClassroomCaption" ADD CONSTRAINT "ClassroomCaption_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "ClassroomRuntime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClassroomCaption_courseId_fkey') THEN
    ALTER TABLE "ClassroomCaption" ADD CONSTRAINT "ClassroomCaption_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClassroomCaption_sessionId_fkey') THEN
    ALTER TABLE "ClassroomCaption" ADD CONSTRAINT "ClassroomCaption_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSessionSeries_courseId_fkey') THEN
    ALTER TABLE "CourseSessionSeries" ADD CONSTRAINT "CourseSessionSeries_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSession_courseId_fkey') THEN
    ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSession_seriesId_fkey') THEN
    ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "CourseSessionSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSessionTeacher_courseId_fkey') THEN
    ALTER TABLE "CourseSessionTeacher" ADD CONSTRAINT "CourseSessionTeacher_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSessionTeacher_sessionId_fkey') THEN
    ALTER TABLE "CourseSessionTeacher" ADD CONSTRAINT "CourseSessionTeacher_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSessionStudent_courseId_fkey') THEN
    ALTER TABLE "CourseSessionStudent" ADD CONSTRAINT "CourseSessionStudent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSessionStudent_sessionId_fkey') THEN
    ALTER TABLE "CourseSessionStudent" ADD CONSTRAINT "CourseSessionStudent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSessionGroupLink_courseId_fkey') THEN
    ALTER TABLE "CourseSessionGroupLink" ADD CONSTRAINT "CourseSessionGroupLink_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSessionGroupLink_sessionId_fkey') THEN
    ALTER TABLE "CourseSessionGroupLink" ADD CONSTRAINT "CourseSessionGroupLink_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSessionGroupLink_groupId_fkey') THEN
    ALTER TABLE "CourseSessionGroupLink" ADD CONSTRAINT "CourseSessionGroupLink_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSessionCourseware_courseId_fkey') THEN
    ALTER TABLE "CourseSessionCourseware" ADD CONSTRAINT "CourseSessionCourseware_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSessionCourseware_sessionId_fkey') THEN
    ALTER TABLE "CourseSessionCourseware" ADD CONSTRAINT "CourseSessionCourseware_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSessionCourseware_coursewareId_fkey') THEN
    ALTER TABLE "CourseSessionCourseware" ADD CONSTRAINT "CourseSessionCourseware_coursewareId_fkey" FOREIGN KEY ("coursewareId") REFERENCES "Courseware"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseJoinLink_sessionId_fkey') THEN
    ALTER TABLE "CourseJoinLink" ADD CONSTRAINT "CourseJoinLink_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Courseware_sessionId_fkey') THEN
    ALTER TABLE "Courseware" ADD CONSTRAINT "Courseware_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClassroomRecording_sessionId_fkey') THEN
    ALTER TABLE "ClassroomRecording" ADD CONSTRAINT "ClassroomRecording_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseAttendance_sessionId_fkey') THEN
    ALTER TABLE "CourseAttendance" ADD CONSTRAINT "CourseAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClassroomRuntime_sessionId_fkey') THEN
    ALTER TABLE "ClassroomRuntime" ADD CONSTRAINT "ClassroomRuntime_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClassroomMemberState_sessionId_fkey') THEN
    ALTER TABLE "ClassroomMemberState" ADD CONSTRAINT "ClassroomMemberState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClassroomMessage_sessionId_fkey') THEN
    ALTER TABLE "ClassroomMessage" ADD CONSTRAINT "ClassroomMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClassroomSpace_sessionId_fkey') THEN
    ALTER TABLE "ClassroomSpace" ADD CONSTRAINT "ClassroomSpace_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClassroomSpaceMember_sessionId_fkey') THEN
    ALTER TABLE "ClassroomSpaceMember" ADD CONSTRAINT "ClassroomSpaceMember_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClassroomQuestion_sessionId_fkey') THEN
    ALTER TABLE "ClassroomQuestion" ADD CONSTRAINT "ClassroomQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
