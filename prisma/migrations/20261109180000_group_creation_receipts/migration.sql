CREATE TABLE "GroupCreationReceipt" (
  "actorId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupCreationReceipt_pkey" PRIMARY KEY ("actorId", "requestId")
);
