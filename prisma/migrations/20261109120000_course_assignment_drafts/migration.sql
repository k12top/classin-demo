CREATE TABLE "CourseAssignmentDraft" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "programId" TEXT,
  "creatorId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "dueDate" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseAssignmentDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourseAssignmentDraft_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CourseAssignmentDraft_programId_courseId_fkey" FOREIGN KEY ("programId", "courseId") REFERENCES "CourseProgram"("id", "courseId") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CourseAssignmentDraft_courseId_creatorId_requestId_key" ON "CourseAssignmentDraft"("courseId", "creatorId", "requestId");
CREATE INDEX "CourseAssignmentDraft_courseId_programId_createdAt_idx" ON "CourseAssignmentDraft"("courseId", "programId", "createdAt");
