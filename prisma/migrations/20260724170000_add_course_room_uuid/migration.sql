-- Preserve existing Agora rooms by leaving legacy courses null. The
-- application falls back to the historical course-ID-derived room UUID until
-- a teacher explicitly reopens the classroom.
ALTER TABLE "Course" ADD COLUMN "roomUuid" TEXT;

CREATE UNIQUE INDEX "Course_roomUuid_key" ON "Course"("roomUuid");
