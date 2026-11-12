CREATE TABLE "CourseAssignmentCreationReceipt" (
  "courseId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "programId" TEXT,
  "unitId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "dueDate" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseAssignmentCreationReceipt_pkey" PRIMARY KEY ("courseId", "creatorId", "requestId"),
  CONSTRAINT "CourseAssignmentCreationReceipt_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Existing drafts retain the best available snapshot; earlier deleted drafts cannot be backfilled.
INSERT INTO "CourseAssignmentCreationReceipt" ("courseId", "creatorId", "requestId", "draftId", "programId", "unitId", "title", "description", "dueDate", "createdAt")
SELECT "courseId", "creatorId", "requestId", "id", "programId", "unitId", "title", "description", "dueDate", "createdAt" FROM "CourseAssignmentDraft";
