ALTER TABLE "ClassroomRuntime"
ADD COLUMN "composition" JSONB NOT NULL DEFAULT '{}'::jsonb;
