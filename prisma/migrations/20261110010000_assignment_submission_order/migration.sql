DROP INDEX "CourseAssignmentSubmission_assignmentId_updatedAt_id_idx";
CREATE INDEX "CourseAssignmentSubmission_assignmentId_submittedAt_id_idx" ON "CourseAssignmentSubmission"("assignmentId", "submittedAt", "id");
