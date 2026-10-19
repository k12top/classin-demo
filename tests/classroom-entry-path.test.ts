import assert from "node:assert/strict";
import test from "node:test";
import { canonicalClassroomEntryPath, classroomVerifyAccessPath } from "../src/lib/classroom/entry-path";

test("course and calendar entry keep course and exact lesson in separate fields", () => {
  const courseId = "course/with space", sessionId = "lesson/with space";
  const course = new URL(classroomVerifyAccessPath(courseId), "https://classroom.example");
  assert.equal(course.pathname, "/api/courses/course%2Fwith%20space/verify-access");
  assert.equal(course.search, "");
  const lesson = new URL(classroomVerifyAccessPath(courseId, sessionId), course.origin);
  assert.equal(lesson.pathname, course.pathname);
  assert.equal(lesson.searchParams.get("sessionId"), sessionId);
});

test("legacy entry becomes a session URL and preserves share, embed, language and host context", () => {
  const original = new URLSearchParams({ courseId: "old-course", shareAccess: "fixture-grant", embed: "1", lang: "zh-TW", parentOrigin: "https://school.example" });
  const path = canonicalClassroomEntryPath(original.toString(), "live-lesson");
  assert.ok(path);
  const target = new URL(path, "https://classroom.example");
  assert.equal(target.pathname, "/classroom");
  assert.equal(target.searchParams.has("courseId"), false);
  assert.equal(target.searchParams.get("sessionId"), "live-lesson");
  for (const [key, value] of original) if (key !== "courseId") assert.equal(target.searchParams.get(key), value);
  assert.equal(canonicalClassroomEntryPath(target.search, "different-lesson"), null, "a bound lesson must never be silently switched");
  assert.equal(canonicalClassroomEntryPath("courseId=same", "same"), "/classroom?sessionId=same", "even coincident IDs need an explicit session scope for later requests");
  assert.equal(canonicalClassroomEntryPath("", "lesson"), null);
  assert.equal(canonicalClassroomEntryPath("courseId=course", ""), null);
});
