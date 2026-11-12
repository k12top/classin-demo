CREATE TABLE "CourseProgram" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseProgram_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CourseProgram_id_courseId_key" ON "CourseProgram"("id", "courseId");
CREATE UNIQUE INDEX "CourseProgram_courseId_name_key" ON "CourseProgram"("courseId", "name");
CREATE UNIQUE INDEX "CourseProgram_courseId_requestId_key" ON "CourseProgram"("courseId", "requestId");
CREATE INDEX "CourseProgram_courseId_createdAt_idx" ON "CourseProgram"("courseId", "createdAt");
ALTER TABLE "CourseProgram" ADD CONSTRAINT "CourseProgram_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSession" ADD COLUMN "programId" TEXT;
CREATE INDEX "CourseSession_courseId_programId_startTime_idx" ON "CourseSession"("courseId", "programId", "startTime");
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_programId_courseId_fkey" FOREIGN KEY ("programId", "courseId") REFERENCES "CourseProgram"("id", "courseId") ON DELETE NO ACTION ON UPDATE CASCADE;
