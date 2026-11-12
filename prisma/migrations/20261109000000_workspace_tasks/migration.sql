CREATE TABLE "WorkspaceTask" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "dueDate" TEXT,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceTask_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkspaceTask_userId_requestId_key" ON "WorkspaceTask"("userId", "requestId");
CREATE INDEX "WorkspaceTask_userId_completed_createdAt_idx" ON "WorkspaceTask"("userId", "completed", "createdAt");
