-- Support bounded per-channel classroom message reads in timestamp order.
CREATE INDEX "ClassroomMessage_sessionId_scope_createdAt_id_idx"
ON "ClassroomMessage"("sessionId", "scope", "createdAt", "id");
