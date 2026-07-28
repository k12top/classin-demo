-- Extend recording and courseware without changing existing behavior.
ALTER TABLE "ClassroomRecording"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'mix',
  ADD COLUMN "fallbackFrom" TEXT,
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Courseware"
  ADD COLUMN "studentCanView" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "studentCanDownload" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "whiteboardEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "conversionError" TEXT;

-- Authoritative classroom runtime. RTC/RTM clients mirror this state but never
-- become its source of truth.
CREATE TABLE "ClassroomRuntime" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'waiting',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3),
  "graceEndsAt" TIMESTAMP(3),
  "stageMode" TEXT NOT NULL DEFAULT 'auto',
  "stageLocked" BOOLEAN NOT NULL DEFAULT false,
  "spotlightUserId" TEXT,
  "activeCoursewareId" TEXT,
  "chatEnabled" BOOLEAN NOT NULL DEFAULT true,
  "timerStartedAt" TIMESTAMP(3),
  "timerDurationSec" INTEGER,
  "timerPausedAt" TIMESTAMP(3),
  "interpretationEnabled" BOOLEAN NOT NULL DEFAULT false,
  "interpretationProvider" TEXT NOT NULL DEFAULT 'shengwang',
  "sourceLanguage" TEXT NOT NULL DEFAULT 'zh-CN',
  "targetLanguages" JSONB NOT NULL DEFAULT '[]',
  "transcriptionStatus" TEXT NOT NULL DEFAULT 'stopped',
  "transcriptionAgentId" TEXT,
  "transcriptionError" TEXT,
  "whiteboardProvider" TEXT NOT NULL DEFAULT 'netless',
  "whiteboardRoomUuid" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomRuntime_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomMemberState" (
  "id" TEXT NOT NULL,
  "runtimeId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL DEFAULT '',
  "avatar" TEXT NOT NULL DEFAULT '',
  "role" TEXT NOT NULL DEFAULT 'student',
  "presence" TEXT NOT NULL DEFAULT 'offline',
  "stageState" TEXT NOT NULL DEFAULT 'offstage',
  "onStage" BOOLEAN NOT NULL DEFAULT false,
  "microphoneAllowed" BOOLEAN NOT NULL DEFAULT false,
  "cameraAllowed" BOOLEAN NOT NULL DEFAULT false,
  "chatMuted" BOOLEAN NOT NULL DEFAULT false,
  "whiteboardWritable" BOOLEAN NOT NULL DEFAULT false,
  "handRaisedAt" TIMESTAMP(3),
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomMemberState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomMessage" (
  "id" TEXT NOT NULL,
  "runtimeId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "senderName" TEXT NOT NULL,
  "senderRole" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'text',
  "content" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "deletedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomCaption" (
  "id" TEXT NOT NULL,
  "runtimeId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
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

CREATE UNIQUE INDEX "ClassroomRuntime_courseId_key" ON "ClassroomRuntime"("courseId");
CREATE INDEX "ClassroomRuntime_status_idx" ON "ClassroomRuntime"("status");
CREATE INDEX "ClassroomRuntime_graceEndsAt_idx" ON "ClassroomRuntime"("graceEndsAt");
CREATE UNIQUE INDEX "ClassroomMemberState_courseId_userId_key" ON "ClassroomMemberState"("courseId", "userId");
CREATE INDEX "ClassroomMemberState_runtimeId_presence_idx" ON "ClassroomMemberState"("runtimeId", "presence");
CREATE INDEX "ClassroomMemberState_courseId_handRaisedAt_idx" ON "ClassroomMemberState"("courseId", "handRaisedAt");
CREATE INDEX "ClassroomMemberState_courseId_onStage_idx" ON "ClassroomMemberState"("courseId", "onStage");
CREATE INDEX "ClassroomMessage_courseId_createdAt_idx" ON "ClassroomMessage"("courseId", "createdAt");
CREATE INDEX "ClassroomMessage_runtimeId_createdAt_idx" ON "ClassroomMessage"("runtimeId", "createdAt");
CREATE UNIQUE INDEX "ClassroomCaption_courseId_externalId_key" ON "ClassroomCaption"("courseId", "externalId");
CREATE INDEX "ClassroomCaption_courseId_occurredAt_idx" ON "ClassroomCaption"("courseId", "occurredAt");
CREATE INDEX "ClassroomCaption_runtimeId_occurredAt_idx" ON "ClassroomCaption"("runtimeId", "occurredAt");

ALTER TABLE "ClassroomRuntime"
  ADD CONSTRAINT "ClassroomRuntime_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomMemberState"
  ADD CONSTRAINT "ClassroomMemberState_runtimeId_fkey"
  FOREIGN KEY ("runtimeId") REFERENCES "ClassroomRuntime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomMemberState"
  ADD CONSTRAINT "ClassroomMemberState_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomMessage"
  ADD CONSTRAINT "ClassroomMessage_runtimeId_fkey"
  FOREIGN KEY ("runtimeId") REFERENCES "ClassroomRuntime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomMessage"
  ADD CONSTRAINT "ClassroomMessage_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomCaption"
  ADD CONSTRAINT "ClassroomCaption_runtimeId_fkey"
  FOREIGN KEY ("runtimeId") REFERENCES "ClassroomRuntime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomCaption"
  ADD CONSTRAINT "ClassroomCaption_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
