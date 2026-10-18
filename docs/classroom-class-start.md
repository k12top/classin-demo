# Class start and recording

Each lesson stores independent `classStartMode` and `recordingStartMode` policies.
New runtimes default to `manual`: at the scheduled time the lead teacher and
assistants see a persistent reminder. Only the lead teacher can start class or
change its start policy in **Settings → Class start**.

With `scheduled`, the lead-teacher browser requests a start once the scheduled
time is reached and its page, RTC connection and required whiteboard are ready.
An intentionally muted microphone or disabled camera does not block readiness.
No student, assistant, recorder, passive poll or cron task can initiate this
transition. The server rechecks the policy, session deadline and authenticated
teacher tab's active connection while holding the runtime lock. A late teacher
starts the timer from actual readiness; scheduled lateness is displayed separately.
Concurrent tabs and manual/automatic starts preserve one actual start/event.
The browser retries temporary failures and rechecks on visibility/network recovery.
A closed or disconnected teacher page waits until a ready teacher page is available.

Recording remains a separate choice: **Record after class starts** or **No recording**.
Disabling recording neither disables auto-start nor changes the class timer.
The recorder still waits for its own recording view readiness.

Deploy migration `20261018010000_independent_class_start` before the new application.
It preserves explicitly selected legacy `scheduled`/`scheduledEarly` policies as
`classStartMode=scheduled` and converts their recording policy to `classStart`.
All automatic starts now happen at the scheduled start, never ten minutes early.
Other existing classrooms default to reminders, preserving disabled recording.
Older clients submitting scheduled recording settings can no longer change the
independent class start policy.

Verification:

- `npm test`
- `node scripts/verify-classroom-start.cjs` (fresh loopback PostgreSQL in Docker)
- `node scripts/verify-classroom-lifecycle.cjs` (existing lifecycle regression)
- `clients/desktop/node_modules/.bin/electron tests/integration/classroom-class-start-ui.cjs`
  (production settings/reminder/scheduler; simulated HTTP persistence and media)

These checks do not establish production deployment or live media-provider acceptance.
