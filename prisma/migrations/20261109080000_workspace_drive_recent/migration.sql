ALTER TABLE "WorkspaceDriveItem" ADD COLUMN "lastOpenedAt" TIMESTAMP(3);
CREATE INDEX "WorkspaceDriveItem_userId_status_lastOpenedAt_id_idx" ON "WorkspaceDriveItem"("userId", "status", "lastOpenedAt", "id");
