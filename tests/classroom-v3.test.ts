import assert from "node:assert/strict";
import {
  classroomCapabilities,
  classroomGraceEndAt,
  classroomStageSeatLimit,
} from "../src/lib/classroom/policy";
import { classroomVideoPresets } from "../src/lib/classroom/config";
import {
  classroomModeFromRoomType,
  classroomModePolicy,
} from "../src/lib/classroom/mode";
import {
  isFinishedDue,
  isTooEarlyToEnterClassroom,
} from "../src/lib/course-status";
import { planLargeClassAssignments } from "../src/lib/classroom/space-planner";

const teacher = classroomCapabilities("teacher");
assert.equal(teacher.canStartClass, true);
assert.equal(teacher.canEndClass, true);
assert.equal(teacher.canControlRecording, true);
assert.equal(teacher.canManageStage, true);
assert.equal(teacher.canManageInterpretation, true);

const assistant = classroomCapabilities("assistant");
assert.equal(assistant.canStartClass, false);
assert.equal(assistant.canEndClass, false);
assert.equal(assistant.canControlRecording, false);
assert.equal(assistant.canManageStage, true);
assert.equal(assistant.canManageMembers, true);
assert.equal(assistant.canManageChat, true);
assert.equal(assistant.canManageWhiteboard, true);
assert.equal(assistant.canShareScreen, true);
assert.equal(assistant.canManageInterpretation, false);

const student = classroomCapabilities("student");
assert.deepEqual(student, {
  canStartClass: false,
  canEndClass: false,
  canControlRecording: false,
  canManageStage: false,
  canManageMembers: false,
  canManageChat: false,
  canManageWhiteboard: false,
  canManageInterpretation: false,
  canShareScreen: false,
});
assert.equal(classroomStageSeatLimit, 6);

assert.equal(classroomModeFromRoomType(0), "oneToOne");
assert.equal(classroomModeFromRoomType(4), "smallClass");
assert.equal(classroomModeFromRoomType(2), "largeClass");
assert.equal(classroomModeFromRoomType(10), "publicLive");
assert.equal(classroomModeFromRoomType(999), "smallClass");
assert.equal(classroomModePolicy(0).defaultStudentOnStage, true);
assert.equal(classroomModePolicy(0).showHandRaise, false);
assert.equal(classroomModePolicy(2).allowBreakouts, true);
assert.equal(classroomModePolicy(10).showLiveRail, false);
assert.equal(classroomModePolicy(10).showMemberRoster, false);
assert.equal(
  classroomCapabilities("student", classroomModePolicy(0)).canShareScreen,
  true,
);

const largeClassAssignments = planLargeClassAssignments(
  [
    { id: "room-1", position: 1, capacity: 2 },
    { id: "room-2", position: 2, capacity: 2 },
  ],
  [
    { userId: "assistant-1", role: "assistant" },
    { userId: "assistant-2", role: "assistant" },
    { userId: "student-1", role: "student" },
    { userId: "student-2", role: "student" },
    { userId: "student-3", role: "student" },
  ],
);
assert.deepEqual(
  largeClassAssignments.filter((item) => item.role === "assistant"),
  [
    { spaceId: "room-1", userId: "assistant-1", role: "assistant" },
    { spaceId: "room-2", userId: "assistant-2", role: "assistant" },
  ],
);
assert.deepEqual(
  largeClassAssignments
    .filter((item) => item.role === "student")
    .map((item) => item.spaceId),
  ["room-1", "room-2", "room-1"],
);
assert.throws(
  () =>
    planLargeClassAssignments(
      [{ id: "room-1", position: 1, capacity: 1 }],
      [
        { userId: "student-1", role: "student" },
        { userId: "student-2", role: "student" },
      ],
    ),
  RangeError,
);

const scheduledEnd = new Date("2026-07-28T12:00:00.000Z");
assert.equal(
  classroomGraceEndAt(scheduledEnd, 20)?.toISOString(),
  "2026-07-28T12:20:00.000Z",
);
assert.equal(classroomGraceEndAt(null, 20), null);
assert.equal(
  isFinishedDue(
    scheduledEnd,
    new Date("2026-07-28T12:19:59.999Z"),
    20,
  ),
  false,
);
assert.equal(
  isFinishedDue(
    scheduledEnd,
    new Date("2026-07-28T12:20:00.000Z"),
    20,
  ),
  true,
);
assert.equal(
  isTooEarlyToEnterClassroom(
    new Date("2026-07-28T12:00:00.000Z"),
    new Date("2026-07-28T10:59:59.999Z"),
    60,
  ),
  true,
);
assert.equal(
  isTooEarlyToEnterClassroom(
    new Date("2026-07-28T12:00:00.000Z"),
    new Date("2026-07-28T11:00:00.000Z"),
    60,
  ),
  false,
);

assert.deepEqual(classroomVideoPresets.hd.camera.low, {
  width: 160,
  height: 120,
  frameRate: 15,
  bitrateKbps: 65,
});
assert.deepEqual(classroomVideoPresets.hd.camera.high, {
  width: 1280,
  height: 720,
  frameRate: 15,
  bitrateKbps: 1500,
});
assert.deepEqual(classroomVideoPresets.hd.screen, {
  width: 1920,
  height: 1080,
  frameRate: 15,
  bitrateKbps: 2500,
  optimizationMode: "detail",
});
assert.equal(classroomVideoPresets.fullHd.camera.high.width, 1920);
assert.equal(classroomVideoPresets.fullHd.camera.high.bitrateKbps, 2500);
