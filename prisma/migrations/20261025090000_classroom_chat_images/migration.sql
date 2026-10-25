CREATE TABLE "ClassroomChatImage" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "contentType" TEXT NOT NULL DEFAULT 'image/webp',
  "bytes" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassroomChatImage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClassroomChatImage_objectKey_key" ON "ClassroomChatImage"("objectKey");
CREATE INDEX "ClassroomChatImage_sessionId_uploaderId_createdAt_idx" ON "ClassroomChatImage"("sessionId","uploaderId","createdAt");
ALTER TABLE "ClassroomChatImage" ADD CONSTRAINT "ClassroomChatImage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
