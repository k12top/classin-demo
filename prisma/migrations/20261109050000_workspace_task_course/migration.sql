ALTER TABLE "WorkspaceTask" ADD COLUMN "courseId" TEXT;
ALTER TABLE "WorkspaceTask" ADD CONSTRAINT "WorkspaceTask_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "WorkspaceTask_userId_courseId_idx" ON "WorkspaceTask"("userId", "courseId");
