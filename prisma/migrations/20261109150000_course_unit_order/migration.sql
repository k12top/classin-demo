ALTER TABLE "CourseProgramUnit" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "CourseProgramUnit_courseId_programId_sortOrder_createdAt_idx" ON "CourseProgramUnit"("courseId", "programId", "sortOrder", "createdAt");
