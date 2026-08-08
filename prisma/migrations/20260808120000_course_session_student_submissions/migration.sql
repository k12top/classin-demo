CREATE TABLE "CourseSessionStudentSubmission" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "studentName" TEXT NOT NULL DEFAULT '',
  "studentAvatar" TEXT NOT NULL DEFAULT '',
  "requirements" TEXT NOT NULL DEFAULT '',
  "leaveStatus" TEXT NOT NULL DEFAULT 'none',
  "leaveReason" TEXT NOT NULL DEFAULT '',
  "leaveRequestedAt" TIMESTAMP(3),
  "leaveWithdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CourseSessionStudentSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseSessionStudentSubmission_sessionId_studentId_key"
  ON "CourseSessionStudentSubmission"("sessionId", "studentId");
CREATE INDEX "CourseSessionStudentSubmission_courseId_studentId_idx"
  ON "CourseSessionStudentSubmission"("courseId", "studentId");
CREATE INDEX "CourseSessionStudentSubmission_sessionId_leaveStatus_idx"
  ON "CourseSessionStudentSubmission"("sessionId", "leaveStatus");

ALTER TABLE "CourseSessionStudentSubmission"
  ADD CONSTRAINT "CourseSessionStudentSubmission_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSessionStudentSubmission"
  ADD CONSTRAINT "CourseSessionStudentSubmission_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CourseSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
