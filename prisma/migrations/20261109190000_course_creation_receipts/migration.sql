CREATE TABLE "CourseCreationReceipt" (
  "requestId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseCreationReceipt_pkey" PRIMARY KEY ("requestId")
);
