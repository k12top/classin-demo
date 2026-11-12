CREATE TABLE "CourseAssignmentSubmission" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseAssignmentSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourseAssignmentSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CoursePublishedAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CourseAssignmentSubmission_assignmentId_studentId_key" ON "CourseAssignmentSubmission"("assignmentId", "studentId");
CREATE INDEX "CourseAssignmentSubmission_assignmentId_updatedAt_id_idx" ON "CourseAssignmentSubmission"("assignmentId", "updatedAt", "id");
CREATE TABLE "CourseAssignmentSubmissionReceipt" (
  "assignmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "expectedVersion" INTEGER,
  "resultVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseAssignmentSubmissionReceipt_pkey" PRIMARY KEY ("assignmentId", "studentId", "requestId"),
  CONSTRAINT "CourseAssignmentSubmissionReceipt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CoursePublishedAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
