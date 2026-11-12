CREATE TABLE "WorkspaceEventReceipt" (
  "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "title" TEXT,
  "notes" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "timeZone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceEventReceipt_pkey" PRIMARY KEY ("userId", "requestId")
);

-- An edited legacy event no longer proves its original payload; keep a
-- tombstone rather than claiming a retry matches an unknown original.
INSERT INTO "WorkspaceEventReceipt" ("userId", "requestId", "eventId", "title", "notes", "startsAt", "endsAt", "timeZone", "createdAt")
SELECT "userId", "requestId", "id",
  CASE WHEN "version" = 0 THEN "title" END,
  CASE WHEN "version" = 0 THEN "notes" END,
  CASE WHEN "version" = 0 THEN "startsAt" END,
  CASE WHEN "version" = 0 THEN "endsAt" END,
  CASE WHEN "version" = 0 THEN "timeZone" END,
  "createdAt"
FROM "WorkspaceEvent";
