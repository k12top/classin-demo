CREATE TABLE "CourseStaffGrantReceipt" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "changes" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseStaffGrantReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CourseStaffGrantReceipt_actorId_requestId_key" ON "CourseStaffGrantReceipt"("actorId", "requestId");
CREATE INDEX "CourseStaffGrantReceipt_courseId_createdAt_idx" ON "CourseStaffGrantReceipt"("courseId", "createdAt");
