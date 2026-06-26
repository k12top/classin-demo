ALTER TABLE "Course"
ADD COLUMN "ownerId" TEXT,
ADD COLUMN "ownerName" TEXT;

UPDATE "Course"
SET
  "ownerId" = "teacherId",
  "ownerName" = "teacherName"
WHERE "ownerId" IS NULL OR "ownerName" IS NULL;

ALTER TABLE "Course" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Course" ALTER COLUMN "ownerName" SET NOT NULL;

CREATE TABLE "CourseTeacher" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseTeacher_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CourseTeacher" ("id", "courseId", "teacherId", "teacherName", "createdAt")
SELECT "id" || ':' || "teacherId", "id", "teacherId", "teacherName", CURRENT_TIMESTAMP
FROM "Course"
ON CONFLICT DO NOTHING;

CREATE INDEX "Course_ownerId_idx" ON "Course"("ownerId");
CREATE INDEX "CourseTeacher_teacherId_idx" ON "CourseTeacher"("teacherId");
CREATE INDEX "CourseTeacher_courseId_idx" ON "CourseTeacher"("courseId");
CREATE UNIQUE INDEX "CourseTeacher_courseId_teacherId_key" ON "CourseTeacher"("courseId", "teacherId");

ALTER TABLE "CourseTeacher"
ADD CONSTRAINT "CourseTeacher_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
