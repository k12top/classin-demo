import assert from "node:assert/strict";
import {
  courseIdToRoomUuid,
  generateCourseRoomUuid,
  legacyCourseRoomUuid,
} from "../src/lib/course-room";

const courseId = "d1e104a0-478e-45f5-9a03-633ba58d86e9";

assert.equal(legacyCourseRoomUuid(courseId), "d1e104a0478e45f5");
assert.equal(courseIdToRoomUuid(courseId, null), "d1e104a0478e45f5");
assert.equal(courseIdToRoomUuid(courseId, " new-room "), "new-room");

const first = generateCourseRoomUuid();
const second = generateCourseRoomUuid();
assert.match(first, /^[a-f0-9]{32}$/);
assert.match(second, /^[a-f0-9]{32}$/);
assert.notEqual(first, second);
