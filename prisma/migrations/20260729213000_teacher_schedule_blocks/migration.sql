CREATE TABLE "TeacherScheduleBlock" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'busy',
    "title" TEXT NOT NULL DEFAULT '',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherScheduleBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TeacherScheduleBlock_teacherId_startTime_idx"
ON "TeacherScheduleBlock"("teacherId", "startTime");

CREATE INDEX "TeacherScheduleBlock_teacherId_endTime_idx"
ON "TeacherScheduleBlock"("teacherId", "endTime");
