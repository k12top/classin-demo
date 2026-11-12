CREATE TABLE "CourseProgramResource" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "programId" TEXT,
  "creatorId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceObjectKey" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseProgramResource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourseProgramResource_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CourseProgramResource_programId_courseId_fkey" FOREIGN KEY ("programId", "courseId") REFERENCES "CourseProgram"("id", "courseId") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CourseProgramResource_objectKey_key" ON "CourseProgramResource"("objectKey");
CREATE UNIQUE INDEX "CourseProgramResource_courseId_creatorId_requestId_key" ON "CourseProgramResource"("courseId", "creatorId", "requestId");
CREATE INDEX "CourseProgramResource_courseId_programId_status_createdAt_idx" ON "CourseProgramResource"("courseId", "programId", "status", "createdAt");
