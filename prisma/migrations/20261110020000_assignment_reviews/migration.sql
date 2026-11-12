CREATE TABLE "CourseAssignmentReview" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "submissionVersion" INTEGER NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "reviewerName" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "feedback" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseAssignmentReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourseAssignmentReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CourseAssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CourseAssignmentReview_submissionId_key" ON "CourseAssignmentReview"("submissionId");
CREATE TABLE "CourseAssignmentReviewReceipt" (
  "submissionId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "submissionVersion" INTEGER NOT NULL,
  "expectedVersion" INTEGER,
  "result" TEXT NOT NULL,
  "feedback" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseAssignmentReviewReceipt_pkey" PRIMARY KEY ("submissionId", "reviewerId", "requestId"),
  CONSTRAINT "CourseAssignmentReviewReceipt_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CourseAssignmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
