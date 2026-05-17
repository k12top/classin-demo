-- CreateTable
CREATE TABLE "CourseJoinLink" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseJoinLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseJoinLink_token_key" ON "CourseJoinLink"("token");

-- CreateIndex
CREATE INDEX "CourseJoinLink_courseId_idx" ON "CourseJoinLink"("courseId");

-- CreateIndex
CREATE INDEX "CourseJoinLink_createdBy_idx" ON "CourseJoinLink"("createdBy");

-- AddForeignKey
ALTER TABLE "CourseJoinLink" ADD CONSTRAINT "CourseJoinLink_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
