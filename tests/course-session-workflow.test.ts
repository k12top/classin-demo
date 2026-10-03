import assert from "node:assert/strict";
import test from "node:test";
import { CourseStatus } from "../src/lib/course-status";
import { aggregateCourseSessionStatus } from "../src/lib/course-session-status-logic";
import {
  screenShareRequestIsActive,
  screenShareStateAfter,
  shouldStopUnauthorizedScreenShare,
} from "../src/lib/classroom/screen-share-state";

const now = new Date("2026-08-08T08:00:00.000Z");
const lesson = (status: string, start: string, end: string, endedAt: Date | null = null) => ({
  status,
  startTime: new Date(start),
  endTime: new Date(end),
  endedAt,
});

test("course aggregate status follows active and future lessons", () => {
  assert.equal(
    aggregateCourseSessionStatus(
      [
        lesson(CourseStatus.FINISHED, "2026-08-07T08:00:00Z", "2026-08-07T09:00:00Z"),
        lesson(CourseStatus.SCHEDULED, "2026-08-09T08:00:00Z", "2026-08-09T09:00:00Z"),
      ],
      now,
    ),
    CourseStatus.SCHEDULED,
  );
  assert.equal(
    aggregateCourseSessionStatus(
      [lesson(CourseStatus.LIVE, "2026-08-08T07:30:00Z", "2026-08-08T08:30:00Z")],
      now,
    ),
    CourseStatus.LIVE,
  );
});

test("course aggregate distinguishes cancelled-only and completed courses", () => {
  assert.equal(
    aggregateCourseSessionStatus(
      [lesson(CourseStatus.CANCELLED, "2026-08-07T08:00:00Z", "2026-08-07T09:00:00Z", now)],
      now,
    ),
    CourseStatus.CANCELLED,
  );
  assert.equal(
    aggregateCourseSessionStatus(
      [
        lesson(CourseStatus.CANCELLED, "2026-08-06T08:00:00Z", "2026-08-06T09:00:00Z", now),
        lesson(CourseStatus.FINISHED, "2026-08-07T08:00:00Z", "2026-08-07T09:00:00Z", now),
      ],
      now,
    ),
    CourseStatus.FINISHED,
  );
});

test("screen-share request, accept, decline and stop transitions are deterministic", () => {
  assert.equal(screenShareStateAfter("idle", "request"), "requested");
  assert.equal(screenShareStateAfter("requested", "accept"), "accepted");
  assert.equal(screenShareStateAfter("requested", "decline"), "declined");
  assert.equal(screenShareStateAfter("accepted", "stop"), "idle");
});

test("screen-share requests expire after two minutes", () => {
  assert.equal(
    screenShareRequestIsActive(
      "requested",
      new Date("2026-08-08T07:58:00.000Z"),
      now,
    ),
    true,
  );
  assert.equal(
    screenShareRequestIsActive(
      "requested",
      new Date("2026-08-08T07:57:59.999Z"),
      now,
    ),
    false,
  );
});

test("only an unauthorized student share is stopped automatically", () => {
  assert.equal(
    shouldStopUnauthorizedScreenShare({
      role: "teacher",
      state: "idle",
      sharing: true,
      allowedWithoutApproval: true,
    }),
    false,
  );
  assert.equal(
    shouldStopUnauthorizedScreenShare({
      role: "assistant",
      state: "idle",
      sharing: true,
      allowedWithoutApproval: true,
    }),
    false,
  );
  assert.equal(
    shouldStopUnauthorizedScreenShare({
      role: "student",
      state: "accepted",
      sharing: true,
      allowedWithoutApproval: false,
    }),
    false,
  );
  assert.equal(
    shouldStopUnauthorizedScreenShare({
      role: "student",
      state: "idle",
      sharing: true,
      allowedWithoutApproval: false,
    }),
    true,
  );
  assert.equal(
    shouldStopUnauthorizedScreenShare({
      role: "student",
      state: "idle",
      sharing: true,
      allowedWithoutApproval: true,
    }),
    false,
  );
});
