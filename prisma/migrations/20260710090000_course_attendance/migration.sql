CREATE TABLE "CourseAttendance" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL DEFAULT '',
    "studentAvatar" TEXT NOT NULL DEFAULT '',
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseAttendance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseAttendance_courseId_idx" ON "CourseAttendance"("courseId");
CREATE INDEX "CourseAttendance_studentId_idx" ON "CourseAttendance"("studentId");
CREATE INDEX "CourseAttendance_courseId_studentId_idx" ON "CourseAttendance"("courseId", "studentId");
CREATE INDEX "CourseAttendance_courseId_enteredAt_idx" ON "CourseAttendance"("courseId", "enteredAt");

ALTER TABLE "CourseAttendance" ADD CONSTRAINT "CourseAttendance_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
