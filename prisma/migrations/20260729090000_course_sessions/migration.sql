-- Course becomes a long-lived container. Existing status/time/room fields stay
-- temporarily for compatibility while every legacy course receives one
-- deterministic default session whose id equals the legacy course id.
ALTER TABLE "Course"
  ADD COLUMN "lifecycleStatus" TEXT NOT NULL DEFAULT 'active';

CREATE TABLE "CourseSessionSeries" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "recurrenceRule" JSONB NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseSessionSeries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseSession" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "seriesId" TEXT,
  "title" TEXT NOT NULL DEFAULT '',
  "position" INTEGER NOT NULL,
  "roomUuid" TEXT NOT NULL,
  "roomType" INTEGER NOT NULL,
  "classroomProvider" TEXT NOT NULL DEFAULT 'agora',
  "recordingProvider" TEXT NOT NULL DEFAULT 'agora',
  "teacherMode" TEXT NOT NULL DEFAULT 'inherit',
  "studentMode" TEXT NOT NULL DEFAULT 'inherit',
  "leadTeacherId" TEXT,
  "leadTeacherName" TEXT NOT NULL DEFAULT '',
  "leadTeacherAvatar" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "isDetached" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseSessionTeacher" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "teacherName" TEXT NOT NULL DEFAULT '',
  "teacherAvatar" TEXT NOT NULL DEFAULT '',
  "action" TEXT NOT NULL DEFAULT 'include',
  "role" TEXT NOT NULL DEFAULT 'assistant',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSessionTeacher_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseSessionStudent" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "studentName" TEXT NOT NULL DEFAULT '',
  "studentAvatar" TEXT NOT NULL DEFAULT '',
  "action" TEXT NOT NULL DEFAULT 'include',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSessionStudent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseSessionGroupLink" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "action" TEXT NOT NULL DEFAULT 'include',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSessionGroupLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseSessionCourseware" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "coursewareId" TEXT NOT NULL,
  "action" TEXT NOT NULL DEFAULT 'exclude',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSessionCourseware_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CourseSession" (
  "id", "courseId", "title", "position", "roomUuid", "roomType",
  "classroomProvider", "recordingProvider", "leadTeacherId",
  "leadTeacherName", "leadTeacherAvatar", "status", "startTime", "endTime",
  "endedAt", "createdBy", "createdAt", "updatedAt"
)
SELECT
  "id", "id", "name", 1,
  COALESCE("roomUuid", replace("id", '-', '')),
  "roomType", "classroomProvider", "recordingProvider", "teacherId",
  "teacherName", "teacherAvatar", "status",
  COALESCE("startTime", "createdAt"),
  COALESCE("endTime", "startTime" + INTERVAL '1 hour', "createdAt" + INTERVAL '1 hour'),
  "endedAt", "ownerId", "createdAt", "updatedAt"
FROM "Course";

ALTER TABLE "CourseJoinLink" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "Courseware" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "ClassroomRecording" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "CourseAttendance" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "ClassroomRuntime" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "ClassroomMemberState" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "ClassroomMessage" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "ClassroomCaption" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "ClassroomSpace" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "ClassroomSpaceMember" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "ClassroomQuestion" ADD COLUMN "sessionId" TEXT;

UPDATE "CourseJoinLink"
SET "sessionId" = "courseId"
WHERE "purpose" <> 'course';
UPDATE "ClassroomRecording" SET "sessionId" = "courseId";
UPDATE "CourseAttendance" SET "sessionId" = "courseId";
UPDATE "ClassroomRuntime" SET "sessionId" = "courseId";
UPDATE "ClassroomMemberState" SET "sessionId" = "courseId";
UPDATE "ClassroomMessage" SET "sessionId" = "courseId";
UPDATE "ClassroomCaption" SET "sessionId" = "courseId";
UPDATE "ClassroomSpace" SET "sessionId" = "courseId";
UPDATE "ClassroomSpaceMember" SET "sessionId" = "courseId";
UPDATE "ClassroomQuestion" SET "sessionId" = "courseId";

ALTER TABLE "ClassroomRecording" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "CourseAttendance" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "ClassroomRuntime" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "ClassroomMemberState" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "ClassroomMessage" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "ClassroomCaption" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "ClassroomSpace" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "ClassroomSpaceMember" ALTER COLUMN "sessionId" SET NOT NULL;
ALTER TABLE "ClassroomQuestion" ALTER COLUMN "sessionId" SET NOT NULL;

DROP INDEX "ClassroomRuntime_courseId_key";
DROP INDEX "ClassroomMemberState_courseId_userId_key";
DROP INDEX "ClassroomSpace_courseId_position_key";
DROP INDEX "ClassroomCaption_courseId_externalId_key";

CREATE UNIQUE INDEX "CourseSession_roomUuid_key" ON "CourseSession"("roomUuid");
CREATE UNIQUE INDEX "CourseSession_courseId_position_key" ON "CourseSession"("courseId", "position");
CREATE INDEX "CourseSession_courseId_startTime_idx" ON "CourseSession"("courseId", "startTime");
CREATE INDEX "CourseSession_courseId_status_idx" ON "CourseSession"("courseId", "status");
CREATE INDEX "CourseSession_seriesId_startTime_idx" ON "CourseSession"("seriesId", "startTime");
CREATE INDEX "CourseSession_leadTeacherId_startTime_idx" ON "CourseSession"("leadTeacherId", "startTime");
CREATE INDEX "CourseSessionSeries_courseId_idx" ON "CourseSessionSeries"("courseId");
CREATE UNIQUE INDEX "CourseSessionTeacher_sessionId_teacherId_key" ON "CourseSessionTeacher"("sessionId", "teacherId");
CREATE INDEX "CourseSessionTeacher_courseId_teacherId_idx" ON "CourseSessionTeacher"("courseId", "teacherId");
CREATE UNIQUE INDEX "CourseSessionStudent_sessionId_studentId_key" ON "CourseSessionStudent"("sessionId", "studentId");
CREATE INDEX "CourseSessionStudent_courseId_studentId_idx" ON "CourseSessionStudent"("courseId", "studentId");
CREATE UNIQUE INDEX "CourseSessionGroupLink_sessionId_groupId_key" ON "CourseSessionGroupLink"("sessionId", "groupId");
CREATE INDEX "CourseSessionGroupLink_courseId_groupId_idx" ON "CourseSessionGroupLink"("courseId", "groupId");
CREATE UNIQUE INDEX "CourseSessionCourseware_sessionId_coursewareId_key" ON "CourseSessionCourseware"("sessionId", "coursewareId");
CREATE INDEX "CourseSessionCourseware_courseId_coursewareId_idx" ON "CourseSessionCourseware"("courseId", "coursewareId");
CREATE INDEX "CourseJoinLink_sessionId_idx" ON "CourseJoinLink"("sessionId");
CREATE INDEX "Courseware_sessionId_idx" ON "Courseware"("sessionId");
CREATE INDEX "ClassroomRecording_sessionId_idx" ON "ClassroomRecording"("sessionId");
CREATE INDEX "CourseAttendance_sessionId_idx" ON "CourseAttendance"("sessionId");
CREATE UNIQUE INDEX "ClassroomRuntime_sessionId_key" ON "ClassroomRuntime"("sessionId");
CREATE UNIQUE INDEX "ClassroomMemberState_sessionId_userId_key" ON "ClassroomMemberState"("sessionId", "userId");
CREATE INDEX "ClassroomMessage_sessionId_createdAt_idx" ON "ClassroomMessage"("sessionId", "createdAt");
CREATE UNIQUE INDEX "ClassroomCaption_sessionId_externalId_key" ON "ClassroomCaption"("sessionId", "externalId");
CREATE INDEX "ClassroomCaption_sessionId_occurredAt_idx" ON "ClassroomCaption"("sessionId", "occurredAt");
CREATE UNIQUE INDEX "ClassroomSpace_sessionId_position_key" ON "ClassroomSpace"("sessionId", "position");
CREATE INDEX "ClassroomSpace_sessionId_status_idx" ON "ClassroomSpace"("sessionId", "status");
CREATE INDEX "ClassroomSpaceMember_sessionId_userId_idx" ON "ClassroomSpaceMember"("sessionId", "userId");
CREATE INDEX "ClassroomQuestion_sessionId_status_createdAt_idx" ON "ClassroomQuestion"("sessionId", "status", "createdAt");

ALTER TABLE "CourseSessionSeries" ADD CONSTRAINT "CourseSessionSeries_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_seriesId_fkey"
  FOREIGN KEY ("seriesId") REFERENCES "CourseSessionSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CourseSessionTeacher" ADD CONSTRAINT "CourseSessionTeacher_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSessionTeacher" ADD CONSTRAINT "CourseSessionTeacher_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSessionStudent" ADD CONSTRAINT "CourseSessionStudent_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSessionStudent" ADD CONSTRAINT "CourseSessionStudent_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSessionGroupLink" ADD CONSTRAINT "CourseSessionGroupLink_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSessionGroupLink" ADD CONSTRAINT "CourseSessionGroupLink_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSessionGroupLink" ADD CONSTRAINT "CourseSessionGroupLink_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSessionCourseware" ADD CONSTRAINT "CourseSessionCourseware_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSessionCourseware" ADD CONSTRAINT "CourseSessionCourseware_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSessionCourseware" ADD CONSTRAINT "CourseSessionCourseware_coursewareId_fkey"
  FOREIGN KEY ("coursewareId") REFERENCES "Courseware"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseJoinLink" ADD CONSTRAINT "CourseJoinLink_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Courseware" ADD CONSTRAINT "Courseware_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomRecording" ADD CONSTRAINT "ClassroomRecording_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseAttendance" ADD CONSTRAINT "CourseAttendance_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomRuntime" ADD CONSTRAINT "ClassroomRuntime_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomMemberState" ADD CONSTRAINT "ClassroomMemberState_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomMessage" ADD CONSTRAINT "ClassroomMessage_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomCaption" ADD CONSTRAINT "ClassroomCaption_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomSpace" ADD CONSTRAINT "ClassroomSpace_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomSpaceMember" ADD CONSTRAINT "ClassroomSpaceMember_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomQuestion" ADD CONSTRAINT "ClassroomQuestion_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
