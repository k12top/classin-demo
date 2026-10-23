-- Ephemeral leases stay in Redis; control and per-topic invalidations have separate versions.
ALTER TABLE "ClassroomRedisSync" ADD COLUMN "controlRefreshedAt" TIMESTAMP(3);
CREATE INDEX "ClassroomRedisSync_controlRefreshedAt_idx" ON "ClassroomRedisSync" ("controlRefreshedAt");
CREATE TABLE "ClassroomCacheVersion" (
 "sessionId" TEXT NOT NULL REFERENCES "CourseSession"("id") ON DELETE CASCADE,
 "topic" TEXT NOT NULL,
 "version" BIGINT NOT NULL DEFAULT 1,
 PRIMARY KEY ("sessionId","topic")
);
CREATE OR REPLACE FUNCTION classroom_queue_redis_sync() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE data JSONB; reference TEXT; course TEXT; topic_name TEXT; control_change BOOLEAN := false;
BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='ClassroomConnection' AND to_jsonb(NEW)->'leftAt' IS NOT DISTINCT FROM to_jsonb(OLD)->'leftAt' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='ClassroomMemberState' AND (to_jsonb(NEW)-'lastSeenAt'-'presence')=(to_jsonb(OLD)-'lastSeenAt'-'presence') THEN RETURN NEW; END IF;
 -- Caption-only revision/error updates do not invalidate room configuration or courseware.
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='ClassroomRuntime' AND (to_jsonb(NEW)-'revision'-'updatedAt'-'transcriptionError')=(to_jsonb(OLD)-'revision'-'updatedAt'-'transcriptionError') THEN RETURN NEW; END IF;
 data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 reference:=CASE WHEN TG_TABLE_NAME='CourseSession' THEN data->>'id' ELSE data->>'sessionId' END;
 topic_name:=CASE WHEN TG_TABLE_NAME='ClassroomCaption' THEN 'captions'
  WHEN TG_TABLE_NAME IN ('Courseware','CourseSessionCourseware') THEN 'courseware'
  WHEN TG_TABLE_NAME IN ('ClassroomEngagementRound','ClassroomEngagementResponse','ClassroomRewardEvent') THEN 'engagement'
  WHEN TG_TABLE_NAME='ClassroomRecording' THEN 'recording' ELSE 'runtime' END;
 control_change:=topic_name='runtime';
 IF reference IS NOT NULL THEN
  -- Parent deletion has already removed the invalidation row; no resurrection.
  IF NOT EXISTS(SELECT 1 FROM "CourseSession" WHERE "id"=reference) THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  INSERT INTO "ClassroomCacheVersion"("sessionId","topic") VALUES(reference,topic_name)
    ON CONFLICT("sessionId","topic") DO UPDATE SET "version"="ClassroomCacheVersion"."version"+1;
  IF control_change THEN
   INSERT INTO "ClassroomRedisSync"("sessionId") VALUES(reference)
    ON CONFLICT("sessionId") DO UPDATE SET "version"=EXCLUDED."version","processedAt"=NULL,"attempts"=0,"nextAttemptAt"=CURRENT_TIMESTAMP,"lastError"=NULL,"updatedAt"=CURRENT_TIMESTAMP;
  END IF;
 ELSE
  course:=CASE WHEN TG_TABLE_NAME='Course' THEN data->>'id' ELSE data->>'courseId' END;
  INSERT INTO "ClassroomRedisSync"("sessionId") SELECT "id" FROM "CourseSession" WHERE "courseId"=course
   ON CONFLICT("sessionId") DO UPDATE SET "version"=EXCLUDED."version","processedAt"=NULL,"attempts"=0,"nextAttemptAt"=CURRENT_TIMESTAMP,"lastError"=NULL,"updatedAt"=CURRENT_TIMESTAMP;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
