CREATE TABLE "CourseSessionCreationRequest" (
  "courseId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "sessionIds" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSessionCreationRequest_pkey" PRIMARY KEY ("courseId", "requestId"),
  CONSTRAINT "CourseSessionCreationRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
