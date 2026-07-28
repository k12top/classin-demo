-- Provider-neutral large-class breakout orchestration. Existing classroom
-- rows remain in the main course channel and require no backfill.
CREATE TABLE "ClassroomSpace" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'breakout',
  "name" TEXT NOT NULL,
  "channelName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'waiting',
  "position" INTEGER NOT NULL,
  "capacity" INTEGER,
  "whiteboardRoomUuid" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomSpace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomSpaceMember" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL DEFAULT '',
  "avatar" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'student',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "microphoneAllowed" BOOLEAN NOT NULL DEFAULT true,
    "cameraAllowed" BOOLEAN NOT NULL DEFAULT true,
    "screenShareAllowed" BOOLEAN NOT NULL DEFAULT false,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "joinedAt" TIMESTAMP(3),
  "leftAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomSpaceMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassroomQuestion" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "spaceId" TEXT,
  "askerId" TEXT NOT NULL,
  "askerName" TEXT NOT NULL DEFAULT '',
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "promotedBy" TEXT,
  "answeredBy" TEXT,
  "answer" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassroomQuestion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ClassroomMessage"
  ADD COLUMN "spaceId" TEXT,
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'classroom',
  ADD COLUMN "recipientId" TEXT;

CREATE UNIQUE INDEX "ClassroomSpace_channelName_key" ON "ClassroomSpace"("channelName");
CREATE UNIQUE INDEX "ClassroomSpace_courseId_position_key" ON "ClassroomSpace"("courseId", "position");
CREATE INDEX "ClassroomSpace_courseId_status_idx" ON "ClassroomSpace"("courseId", "status");
CREATE UNIQUE INDEX "ClassroomSpaceMember_spaceId_userId_key" ON "ClassroomSpaceMember"("spaceId", "userId");
CREATE INDEX "ClassroomSpaceMember_courseId_userId_idx" ON "ClassroomSpaceMember"("courseId", "userId");
CREATE INDEX "ClassroomSpaceMember_spaceId_role_active_idx" ON "ClassroomSpaceMember"("spaceId", "role", "active");
CREATE INDEX "ClassroomQuestion_courseId_status_createdAt_idx" ON "ClassroomQuestion"("courseId", "status", "createdAt");
CREATE INDEX "ClassroomQuestion_spaceId_status_createdAt_idx" ON "ClassroomQuestion"("spaceId", "status", "createdAt");
CREATE INDEX "ClassroomMessage_spaceId_createdAt_idx" ON "ClassroomMessage"("spaceId", "createdAt");
CREATE INDEX "ClassroomMessage_courseId_scope_createdAt_idx" ON "ClassroomMessage"("courseId", "scope", "createdAt");

ALTER TABLE "ClassroomSpace"
  ADD CONSTRAINT "ClassroomSpace_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomSpaceMember"
  ADD CONSTRAINT "ClassroomSpaceMember_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomSpaceMember"
  ADD CONSTRAINT "ClassroomSpaceMember_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "ClassroomSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomQuestion"
  ADD CONSTRAINT "ClassroomQuestion_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomQuestion"
  ADD CONSTRAINT "ClassroomQuestion_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "ClassroomSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassroomMessage"
  ADD CONSTRAINT "ClassroomMessage_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "ClassroomSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
