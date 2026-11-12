CREATE TABLE "CourseProgramUnit" (
 "id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "programId" TEXT, "creatorId" TEXT NOT NULL,
 "requestId" TEXT NOT NULL, "name" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CourseProgramUnit_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "CourseProgramUnit_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "CourseProgramUnit_programId_courseId_fkey" FOREIGN KEY ("programId", "courseId") REFERENCES "CourseProgram"("id", "courseId") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CourseProgramUnit_id_courseId_key" ON "CourseProgramUnit"("id", "courseId");
CREATE UNIQUE INDEX "CourseProgramUnit_courseId_creatorId_requestId_key" ON "CourseProgramUnit"("courseId", "creatorId", "requestId");
CREATE INDEX "CourseProgramUnit_courseId_programId_createdAt_idx" ON "CourseProgramUnit"("courseId", "programId", "createdAt");
ALTER TABLE "CourseSession" ADD COLUMN "unitId" TEXT;
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_unitId_courseId_fkey" FOREIGN KEY ("unitId", "courseId") REFERENCES "CourseProgramUnit"("id", "courseId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "CourseProgramResource" ADD COLUMN "unitId" TEXT;
ALTER TABLE "CourseProgramResource" ADD CONSTRAINT "CourseProgramResource_unitId_courseId_fkey" FOREIGN KEY ("unitId", "courseId") REFERENCES "CourseProgramUnit"("id", "courseId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "CourseAssignmentDraft" ADD COLUMN "unitId" TEXT;
ALTER TABLE "CourseAssignmentDraft" ADD CONSTRAINT "CourseAssignmentDraft_unitId_courseId_fkey" FOREIGN KEY ("unitId", "courseId") REFERENCES "CourseProgramUnit"("id", "courseId") ON DELETE NO ACTION ON UPDATE CASCADE;
