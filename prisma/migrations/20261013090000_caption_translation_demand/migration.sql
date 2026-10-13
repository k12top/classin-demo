ALTER TABLE "ClassroomConnection" ADD COLUMN "captionLanguage" TEXT;
ALTER TABLE "ClassroomRuntime" ADD COLUMN "transcriptionConfigKey" TEXT,
  ADD COLUMN "transcriptionSyncLeaseUntil" TIMESTAMP(3);
-- Existing enabled targets were configured eagerly. Reconciliation will derive
-- targets from active tab subscriptions and update running agents.
UPDATE "ClassroomRuntime" SET "targetLanguages" = '[]'::jsonb WHERE "status" <> 'ended';
