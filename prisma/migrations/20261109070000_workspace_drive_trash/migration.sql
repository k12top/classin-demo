ALTER TABLE "WorkspaceDriveItem" ADD COLUMN "trashRootId" TEXT;
CREATE INDEX "WorkspaceDriveItem_userId_trashRootId_status_idx" ON "WorkspaceDriveItem"("userId", "trashRootId", "status");
