ALTER TABLE "ClassroomConnection"
  ADD COLUMN "deviceId" TEXT,
  ADD COLUMN "deviceLabel" TEXT,
  ADD COLUMN "entryMode" TEXT,
  ADD COLUMN "replacedAt" TIMESTAMP(3);
