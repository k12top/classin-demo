CREATE TABLE "CoursePublishedAssignment" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "programId" TEXT,
  "unitId" TEXT,
  "sourceDraftId" TEXT NOT NULL,
  "sourceVersion" INTEGER NOT NULL,
  "publisherId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "dueDate" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoursePublishedAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoursePublishedAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CoursePublishedAssignment_programId_courseId_fkey" FOREIGN KEY ("programId", "courseId") REFERENCES "CourseProgram"("id", "courseId") ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT "CoursePublishedAssignment_unitId_courseId_fkey" FOREIGN KEY ("unitId", "courseId") REFERENCES "CourseProgramUnit"("id", "courseId") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CoursePublishedAssignment_sourceDraftId_key" ON "CoursePublishedAssignment"("sourceDraftId");
CREATE UNIQUE INDEX "CoursePublishedAssignment_courseId_publisherId_requestId_key" ON "CoursePublishedAssignment"("courseId", "publisherId", "requestId");
CREATE INDEX "CoursePublishedAssignment_courseId_programId_unitId_publishedAt_idx" ON "CoursePublishedAssignment"("courseId", "programId", "unitId", "publishedAt");
