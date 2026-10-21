-- REVIEW ONLY. Not registered in prisma/migrations and never executed by this task.
-- This design needs schema approval before wiring/activating durable delivery.
CREATE TABLE "ClassroomRealtimeStream" (
  "sessionId" TEXT NOT NULL REFERENCES "CourseSession"("id") ON DELETE CASCADE,
  "audience" TEXT NOT NULL CHECK ("audience" = 'public'),
  "epoch" TEXT NOT NULL,
  "sequence" BIGINT NOT NULL DEFAULT 0 CHECK ("sequence" >= 0),
  PRIMARY KEY ("sessionId", "audience")
);
CREATE TABLE "ClassroomRealtimeOutbox" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "audience" TEXT NOT NULL CHECK ("audience" = 'public'),
  "epoch" TEXT NOT NULL,
  "sequence" BIGINT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "claim" TEXT,
  "lockedUntil" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  UNIQUE ("sessionId", "audience", "epoch", "sequence"),
  FOREIGN KEY ("sessionId", "audience") REFERENCES "ClassroomRealtimeStream"("sessionId", "audience") ON DELETE CASCADE
);
CREATE INDEX "ClassroomRealtimeOutbox_due" ON "ClassroomRealtimeOutbox" ("nextAttemptAt", "createdAt") WHERE "deliveredAt" IS NULL;
CREATE TABLE "ClassroomRealtimeTombstone" (
  "sessionId" TEXT NOT NULL,
  "audience" TEXT NOT NULL CHECK ("audience" = 'public'),
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "entityVersion" BIGINT NOT NULL,
  PRIMARY KEY ("sessionId", "audience", "entity", "entityId"),
  FOREIGN KEY ("sessionId", "audience") REFERENCES "ClassroomRealtimeStream"("sessionId", "audience") ON DELETE CASCADE
);
-- Retention is intentionally not scheduled: review transcript/outbox/tombstone
-- retention together. Never expire a tombstone while an older upsert can replay.
