import assert from "node:assert/strict";
import test from "node:test";
import { buildAttendanceCsv } from "../src/lib/attendance-export";

test("attendance CSV omits entry and activity timestamp columns", () => {
  const csv = buildAttendanceCsv([
    {
      studentId: "student-1",
      studentName: "Ada, Lovelace",
      sessionCount: 2,
      totalDurationSec: 3723,
      online: false,
      closedByCourseEnd: true,
      status: "attended",
      leaveReason: "",
    },
  ]);

  assert.equal(
    csv,
    [
      '"studentId","studentName","sessionCount","totalDurationSec","totalDuration","online","closedByCourseEnd","status","leaveReason"',
      '"student-1","Ada, Lovelace","2","3723","01:02:03","false","true","attended",""',
    ].join("\n")
  );
});
