# Classroom real-time delivery and recovery

## Implemented locally

PostgreSQL/authorized HTTP remain authoritative. Fastboard synchronizes document/windows/pages; RTC provides live media and original speech increments. No competing page or remote-media state source is introduced.

- Repeated document presentation retains an SDK app ID, restores/focuses an existing window and recreates a closed one. Task versions, in-flight deduplication and latest-request focus are independent. Obsolete SDK instances or a newly read-only board cannot gain focus after an asynchronous insertion.
- Microphone UI uses observed capture/publication state, waits for SDK publication/unmute acknowledgement, reacts to ended/mute/unmute and stops native capture immediately on moderation. Device changes rebind native observers. Capture/publish operations are deduplicated across clicks and recovery.
- RTM link-state loss restores polling. Reconnect restores subscriptions and fetches an authorized snapshot/messages. Stale restore acknowledgements cannot mark a disconnected connection healthy.
- Caption/courseware hints fetch coalesced authorized sections. Caption entity timestamps/final-over-partial merging protect corrections and their translations. Hidden courseware and staff/direct/breakout messages are never placed into peer messages.
- Full snapshots do not query document conversion providers. Pending visible conversions use a separate interactive poll; saved task region and stale-task CAS remain intact.
- Command nonces and atomic receipts cover normal runtime mutations and compact hand/permission/share-request paths, using the existing `ClassroomProviderEvent` table. Current authorization runs before lookup. Changed input/role conflicts; successful replay skips mutation/provider effects. Heartbeats and the absolute scheduled-start guard retain their existing semantics. The old automatic retry whitelist remains compatible with older servers.
- Device reports use RTM USER unicast to the control sender. Command, lesson, member, native publisher, revision, target/current permission and 30-second window are validated. Duplicate/stale/forged reports are ignored. Reports are advisory: they cannot grant permission, replace RTC presence or imply all devices complied. Teacher UI distinguishes saved permissions from device responses or missing responses. Camera reports check actual publication/native state, not optimistic UI intent.

## Translation recovery

Original caption and `preparing` reservation commit atomically; no provider request occurs inside a DB transaction. Fenced states are `preparing → requesting → translated → completed`. Provider-event keys include session/caption/text/source/targets; corrections cannot receive old-text translations.

- Preparation failure before transcript dispatch is `failed`. Explicit teacher recovery may retry this safe phase. An abandoned preparation becomes retryable after 60 seconds, using CAS; an old owner cannot overwrite or dispatch after a new claim.
- A timed-out/ambiguous dispatch is `unknown`, including legacy ambiguous reservations. No automatic or explicit replay is allowed on this path.
- Complete provider output is saved before the caption commit. A later DB commit failure can be recovered from saved output without a provider call. Repeated recovery is idempotent.
- The caption panel exposes pending/failed/unknown/recoverable states, teacher recovery during active classroom authorization, duplicate-click locking and accurate failure feedback. Students cannot invoke recovery. A post-lesson management recovery workflow is a separate product decision; the current classroom controls follow existing ended-class access.

External dependency for unknown outcomes: Wordly's current `bridgeTranscriptHandler` translates before history deduplication. The bridge exposes POST transcripts but no authenticated per-caption result lookup. Normal history GET has separate room/history authorization; the internal bridge token must not be assumed to authorize it. A separately authorized Wordly read-only result endpoint could restore found output. A missing result still does not prove no upstream charge; replay requires an idempotency/reconciliation contract or an explicit product decision to permit a potentially new billed attempt. No Wordly source, permissions or credentials were changed.

## Prepared, not active end-to-end

- `server-publisher.ts`: existing Agora credential fields, default-off `CLASSROOM_SERVER_RTM_EVENTS_ENABLED`, HMAC-derived server principal, REST transport, confirmation checking and public payload budget. The credential issuer refuses to mint the reserved identity when enabled.
- `realtime-outbox.ts`: transaction-scoped ordered enqueue/tombstones, leased oldest-per-stream dispatch, network outside the lease transaction, claim-fenced acknowledgement and bounded retry delay.
- `committed-stream.ts`: native server-publisher validation, epoch/sequence checks, duplicate rejection, coalesced snapshot recovery on gaps, retired epochs, entity versions/tombstones and public DTO rejection of private messages, unknown fields and courseware metadata.
- `docs/migrations/classroom-realtime-outbox.sql`: review-only stream/outbox/tombstone tables, outside `prisma/migrations` so an ordinary build/release cannot silently apply them.

These components have isolated mock tests. No SQL or live Signaling acceptance test ran. They are not wired into mutation hooks, snapshot watermarks, the live stream consumer or cron dispatch. Current classroom updates still use authorized HTTP-section reads; zero-follow-up-HTTP delivery is NOT complete. Do not enable the flag in this state.

Remaining dependencies and work:
1. Review this design's three tables, indexes and retention. A dedicated schema is a design choice, not a claim that all implementations require new tables. Migration activation is prohibited without approval.
2. Wire mutations and outbox atomically, then use the existing after/cron infrastructure. Full authorized snapshots need a matching stream watermark and entity/tombstone versions; cached/partial snapshots must not advance that watermark. Isolated DB/rollback/gap tests and end-to-end hook/consumer verification remain after schema approval. This integration is remaining work, not an observed permission denial.
3. Verify deployed Agora App/REST-account Signaling publication permission and dataset/channel alignment. The Mac fields exist; production values/permission were not proven. No real acceptance message or new credential was created. A credential change is not necessarily needed.
4. Keep staff/direct/breakout and hidden-courseware data on authorized HTTP until authenticated audience-specific delivery is designed. Channel naming is not authorization.
5. Measure click→HTTP commit, commit→publish, receive→SDK focus and SDK ACK→render separately. No production latency reduction, real media quality or provider acceptance was measured.

## Recording lifecycle and empty classroom closure

The confirmed product rule is 180 seconds continuously empty, configurable with `CLASSROOM_EMPTY_GRACE_SECONDS` (0 disables; no environment variable was modified during implementation). Only an already live/started classroom with authenticated human connection history qualifies. Recorder bootstrap never registers a human connection. All tabs/devices count. Explicit leave closes that tab lease; an unannounced browser/network loss first receives the existing 120-second reconnect lease. The minute cron observes absence and persists the observation in the existing provider-event ledger. It closes after at least three minutes from that observation, usually 3–4 minutes after an observed explicit departure. A new join cancels the observation; fresh heartbeats restart it. The first observation protects deployment/cold-start/stale-cache cases. No browser timer or process memory is required.

Join and closure share the runtime row lock. While this policy is enabled, human heartbeats use durable PostgreSQL leases rather than Redis-only refresh; heartbeat's share lock skips a concurrent end and reports a retryable refresh failure. This adds one lightweight database lease write per heartbeat; Redis still serves other snapshots. Never derive this policy from raw RTC users or a stale Redis-only snapshot.

Lesson closure and recorder cleanup are separate durable operations. Starting/recording/processing and legacy failed-stop records are reconciled. A stop response, replay file, timeout, HTTP404 or provider status6/7 does not prove task exit. Only verified query exit status8/20 or a signed exact-SID NCS session_exit event11 confirms task exit. Replay readiness is stored independently. An in-flight start that loses to stop persists its late SID before cleanup; unknown start outcomes cannot create another recorder automatically.

Existing recording JSON stores stop intent, fenced 90-second lease, stop/query attempt counts, backoff and exit confirmation. One provider operation runs per reconcile call, outside the short row transaction. Automated work is bounded to six same-SID stop attempts and 24 verification/replay queries, with 15–300 second backoff; exhaustion retains an operator-attention state and emits a log, never fabricated success or a dropped failed row. A current authorized teacher's explicit stop request can re-arm that record for query-first verification. No automatic reset occurs. A recent (24-hour) bounded legacy-completed audit rechecks rows previously completed from files with stop markers; older history is not bulk changed.

No migration is needed for these lifecycle changes: existing recording JSON and `ClassroomProviderEvent` are used. Live provider acceptance, real PostgreSQL lock contention, missing-NCS behavior and production billing were not tested. If query becomes404 after exit and NCS is unavailable, verification remains unknown/attention; an asset alone cannot safely settle it. Verify webhook setup/retention before release acceptance. Local source tests mock every provider/database boundary and do not prove any current billable orphan.

Official references: [query status](https://docs.agora.io/en/api-reference/api-ref/cloud-recording/query), [recording notifications](https://docs.agora.io/en/realtime-media/cloud-recording/build/handle-events/receive-notifications), [response codes](https://docs.agora.io/en/api-reference/api-ref/cloud-recording/status-codes).
