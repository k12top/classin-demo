CREATE TABLE "ClassroomScreenInkAsset" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassroomScreenInkAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClassroomScreenInkAsset_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClassroomScreenInkAsset_objectKey_key" ON "ClassroomScreenInkAsset"("objectKey");
CREATE INDEX "ClassroomScreenInkAsset_sessionId_uploaderId_createdAt_idx" ON "ClassroomScreenInkAsset"("sessionId", "uploaderId", "createdAt");
