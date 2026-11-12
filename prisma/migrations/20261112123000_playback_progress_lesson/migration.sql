-- Bind the active watch session to its authorized lesson; legacy recordings use NULL.
ALTER TABLE "CoursePlaybackProgress" ADD COLUMN "playbackLessonId" TEXT;
