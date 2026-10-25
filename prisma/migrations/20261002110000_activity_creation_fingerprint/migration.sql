-- Immutable create-request identity; existing rows keep legacy comparison.
ALTER TABLE "ClassroomActivity" ADD COLUMN "creationFingerprint" TEXT;
