CREATE TABLE "WorkspaceMessage" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "senderName" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceMessage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkspaceMessage_courseId_senderId_clientId_key" ON "WorkspaceMessage"("courseId", "senderId", "clientId");
CREATE INDEX "WorkspaceMessage_courseId_createdAt_id_idx" ON "WorkspaceMessage"("courseId", "createdAt", "id");
