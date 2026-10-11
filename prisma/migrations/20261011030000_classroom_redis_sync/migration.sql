CREATE TABLE "ClassroomRedisSync" (
  "sessionId" TEXT PRIMARY KEY,
  "version" BIGSERIAL NOT NULL,
  "processedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ClassroomRedisSync_processedAt_nextAttemptAt_idx" ON "ClassroomRedisSync"("processedAt", "nextAttemptAt");
-- A coalesced transactional outbox: heartbeat-only updates deliberately do not enqueue.
CREATE FUNCTION classroom_queue_redis_sync() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE data JSONB; reference TEXT; course TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'ClassroomConnection' AND
     to_jsonb(NEW)->'leftAt' IS NOT DISTINCT FROM to_jsonb(OLD)->'leftAt' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'ClassroomMemberState' AND
     (to_jsonb(NEW) - 'lastSeenAt' - 'presence') = (to_jsonb(OLD) - 'lastSeenAt' - 'presence') THEN RETURN NEW; END IF;
  data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  reference := CASE WHEN TG_TABLE_NAME = 'CourseSession' THEN data->>'id' ELSE data->>'sessionId' END;
  IF reference IS NOT NULL THEN
    INSERT INTO "ClassroomRedisSync" ("sessionId") VALUES (reference)
    ON CONFLICT ("sessionId") DO UPDATE SET "version"=EXCLUDED."version", "processedAt"=NULL,
      "attempts"=0,"nextAttemptAt"=CURRENT_TIMESTAMP,"lastError"=NULL,"updatedAt"=CURRENT_TIMESTAMP;
  ELSE
    course := CASE WHEN TG_TABLE_NAME = 'Course' THEN data->>'id' ELSE data->>'courseId' END;
    INSERT INTO "ClassroomRedisSync" ("sessionId") SELECT "id" FROM "CourseSession" WHERE "courseId"=course
    ON CONFLICT ("sessionId") DO UPDATE SET "version"=EXCLUDED."version", "processedAt"=NULL,
      "attempts"=0,"nextAttemptAt"=CURRENT_TIMESTAMP,"lastError"=NULL,"updatedAt"=CURRENT_TIMESTAMP;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DO $$ DECLARE name TEXT; BEGIN
  FOREACH name IN ARRAY ARRAY['ClassroomRuntime','ClassroomMemberState','ClassroomConnection','ClassroomCaption',
    'ClassroomEngagementRound','ClassroomEngagementResponse','ClassroomRewardEvent','Courseware','CourseSessionCourseware',
    'CourseSession','Course','ClassroomRecording'] LOOP
    EXECUTE format('CREATE TRIGGER classroom_redis_sync AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION classroom_queue_redis_sync()',name);
  END LOOP;
END $$;
INSERT INTO "ClassroomRedisSync" ("sessionId") SELECT "sessionId" FROM "ClassroomRuntime" ON CONFLICT DO NOTHING;
