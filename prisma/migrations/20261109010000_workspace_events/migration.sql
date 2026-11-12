CREATE TABLE "WorkspaceEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "timeZone" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkspaceEvent_userId_requestId_key" ON "WorkspaceEvent"("userId", "requestId");
CREATE INDEX "WorkspaceEvent_userId_startsAt_idx" ON "WorkspaceEvent"("userId", "startsAt");
CREATE INDEX "WorkspaceEvent_userId_endsAt_idx" ON "WorkspaceEvent"("userId", "endsAt");
