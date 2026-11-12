ALTER TABLE "WorkspaceTask" ADD COLUMN "sessionId" TEXT;
CREATE INDEX "WorkspaceTask_sessionId_idx" ON "WorkspaceTask"("sessionId");
ALTER TABLE "WorkspaceTask" ADD CONSTRAINT "WorkspaceTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
