CREATE TABLE "WorkspaceChatRead" (
  "courseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastCreatedAt" TIMESTAMP(3) NOT NULL,
  "lastMessageId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceChatRead_pkey" PRIMARY KEY ("courseId", "userId"),
  CONSTRAINT "WorkspaceChatRead_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
