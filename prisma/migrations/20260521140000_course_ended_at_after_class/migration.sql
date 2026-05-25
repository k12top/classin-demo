-- Add endedAt for delayed transition afterClass -> finished
ALTER TABLE "Course" ADD COLUMN "endedAt" TIMESTAMP(3);
