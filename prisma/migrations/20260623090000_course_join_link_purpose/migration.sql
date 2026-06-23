-- Add purpose so course share links can be kept separate from live classroom links.
ALTER TABLE "CourseJoinLink"
ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'live';

CREATE INDEX "CourseJoinLink_courseId_purpose_idx"
ON "CourseJoinLink"("courseId", "purpose");
