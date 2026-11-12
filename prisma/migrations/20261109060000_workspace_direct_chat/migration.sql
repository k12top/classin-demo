CREATE TABLE "WorkspaceDirectChat" (
 "id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "participantA" TEXT NOT NULL, "participantB" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WorkspaceDirectChat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkspaceDirectChat_courseId_participantA_participantB_key" ON "WorkspaceDirectChat"("courseId", "participantA", "participantB");
CREATE INDEX "WorkspaceDirectChat_participantA_idx" ON "WorkspaceDirectChat"("participantA");
CREATE INDEX "WorkspaceDirectChat_participantB_idx" ON "WorkspaceDirectChat"("participantB");
ALTER TABLE "WorkspaceDirectChat" ADD CONSTRAINT "WorkspaceDirectChat_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkspaceDirectMessage" (
 "id" TEXT NOT NULL, "chatId" TEXT NOT NULL, "senderId" TEXT NOT NULL, "senderName" TEXT NOT NULL,
 "clientId" TEXT NOT NULL, "content" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WorkspaceDirectMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkspaceDirectMessage_chatId_senderId_clientId_key" ON "WorkspaceDirectMessage"("chatId", "senderId", "clientId");
CREATE INDEX "WorkspaceDirectMessage_chatId_createdAt_id_idx" ON "WorkspaceDirectMessage"("chatId", "createdAt", "id");
ALTER TABLE "WorkspaceDirectMessage" ADD CONSTRAINT "WorkspaceDirectMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "WorkspaceDirectChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkspaceDirectRead" (
 "chatId" TEXT NOT NULL, "userId" TEXT NOT NULL, "lastCreatedAt" TIMESTAMP(3) NOT NULL,
 "lastMessageId" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "WorkspaceDirectRead_pkey" PRIMARY KEY ("chatId", "userId")
);
ALTER TABLE "WorkspaceDirectRead" ADD CONSTRAINT "WorkspaceDirectRead_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "WorkspaceDirectChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
