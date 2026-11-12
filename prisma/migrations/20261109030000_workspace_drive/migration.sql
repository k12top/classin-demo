CREATE TABLE "WorkspaceDriveItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "parentId" TEXT,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "size" INTEGER NOT NULL DEFAULT 0,
  "contentType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  "objectKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceDriveItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceDriveItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkspaceDriveItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkspaceDriveItem_userId_requestId_key" ON "WorkspaceDriveItem"("userId", "requestId");
CREATE UNIQUE INDEX "WorkspaceDriveItem_objectKey_key" ON "WorkspaceDriveItem"("objectKey");
CREATE INDEX "WorkspaceDriveItem_userId_parentId_status_createdAt_idx" ON "WorkspaceDriveItem"("userId", "parentId", "status", "createdAt");
