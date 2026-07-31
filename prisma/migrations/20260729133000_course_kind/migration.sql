-- Keep this migration independent from the CourseSession rollout. Some
-- environments applied that migration before courseKind was introduced.
ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "courseKind" TEXT NOT NULL DEFAULT 'series';
