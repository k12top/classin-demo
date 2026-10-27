ALTER TABLE "Course" ADD COLUMN "captionStartPreferences" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "ClassroomRuntime" ADD COLUMN "captionStartPreferences" JSONB NOT NULL DEFAULT '{}';
