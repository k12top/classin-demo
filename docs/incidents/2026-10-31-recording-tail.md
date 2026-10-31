# Recording continued after teaching ended

Affected session: `0237942b-6502-4aa1-88fc-423f95531aed`.
Recording: `1393f5cc-5b34-49b5-a296-901396b853fe`.

## Evidence (Asia/Shanghai)

- Recording started at 16:15:26.894. Original MP4 duration was 2:30:01.069.
- Last teacher caption: 18:04:59.919. Teacher connection departure: 18:05:02.336, recorded as `temporary`.
- `CourseSession.endedAt` was null. No durable evidence of a successful manual end was present. This does not establish which controls the teacher clicked or whether an unrecorded request failed.
- Scheduled end was 18:15. Temporary departure preserved the room until the 18:45 grace deadline. Server stop was queued at 18:45:25.810; final recording objects were modified by 18:45:52.
- Stop verification exhausted its bounded query budget with authenticated missing-worker responses. A successful stop acknowledgment was not retained. Historical provider exit remains unconfirmed; do not fabricate `endedAt` or `stoppedAt` from the last caption or an HTTP 404.

## Playback repair

The original MP4 and HLS playlist were inspected. Teaching continues beyond 1:45; the final blank/silent transition is at 1:49:34.069. The repaired MP4 preserves every retained audio/video packet, passes full decode, and removes 40:27 of terminal blank material. Original object was copied to a separate backup before replacing the playback object. A durable `playback-edit` provider event and recording `providerState.playbackEdit` record the backup, edit identity, original/retained durations and packet-preservation result. No historical class-end or provider-exit timestamp was invented.

## Prevention

- A teaching user's back action asks explicitly whether to leave temporarily or end the class. Temporary leave says the class/recording continues. The explicit end dialog offers end-and-stop, without a second temporary-leave action.
- End requests have a 10-second per-attempt timeout and at most two attempts for transient failures. Navigation waits for an explicit terminal acknowledgment. Failed requests keep the classroom open with a retryable error.
- The server fences requests to the current runtime cycle, preserves the first end/stop time on retries, and records a transactional audit even when external webhooks are disabled. Processing and uncertain-start recordings are included in the durable stop queue.
- Recording provider failures retain sanitized HTTP/business codes and operation categories. Storage recovery also runs from a persisted stop request when its HTTP acknowledgment was lost. Missing workers alone still cannot prove recorder exit.

## Verification

Isolated PostgreSQL migrations/integration cover concurrent lifecycle changes, end retries, stable timestamps, uncertain recording states, reopened-cycle rejection, and rollback. Chromium fixtures cover desktop/mobile exit choices, transient failures, acknowledgment before navigation, overtime leave and pagehide. Focused tests cover malformed responses, permission failures, sanitized provider errors and exit evidence. Production build and type checking are required before release. Video validation and original-link browser metadata verify the repaired duration.

Cloud recording/device end-to-end acceptance in a real teacher session remains separate from these local checks. Deployment does not require ending or restarting any active lesson.
