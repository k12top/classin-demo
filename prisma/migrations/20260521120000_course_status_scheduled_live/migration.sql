-- Migrate course status: active -> scheduled; default scheduled
ALTER TABLE "Course" ALTER COLUMN "status" SET DEFAULT 'scheduled';
UPDATE "Course" SET "status" = 'scheduled' WHERE "status" = 'active';
