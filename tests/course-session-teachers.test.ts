import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSessionTeacherRules,
  resolveSessionLeadTeacher,
  sessionTeacherFromDirectory,
} from "../src/lib/course-session-teachers";

const owner = { teacherId: "0190e134-096d-4369-8b64-0650206d207", teacherName: "nkwill" };
const wang = { teacherId: "b6bc45e9-f7a1-4947-b76e-8c845a096375", teacherName: "王老师" };
const directoryWang = {
  id: "azenglish", name: "azenglish", displayName: "王老师", casdoorUuid: wang.teacherId,
};

test("teacher search uses UUID for new assignments and reuses saved UUID or login identities", () => {
  assert.deepEqual(sessionTeacherFromDirectory(directoryWang, []), { ...wang, teacherAvatar: "" });
  assert.equal(sessionTeacherFromDirectory(directoryWang, [wang]), wang);
  const legacyWang = { ...wang, teacherId: "school/azenglish" };
  assert.equal(sessionTeacherFromDirectory(directoryWang, [legacyWang]), legacyWang);
});

test("saved teachers stay inherited so future course roster changes still apply", () => {
  assert.deepEqual(buildSessionTeacherRules({
    courseTeachers: [owner, wang], availableTeachers: [owner, wang],
    selectedTeacherIds: [owner.teacherId, wang.teacherId], leadTeacherId: wang.teacherId,
    mode: "inherit",
  }), []);
});

test("a temporary lead is explicitly included while unchecked inherited teachers are excluded", () => {
  const rules = buildSessionTeacherRules({
    courseTeachers: [owner], availableTeachers: [owner, wang],
    selectedTeacherIds: [wang.teacherId], leadTeacherId: wang.teacherId,
    mode: "inherit",
  });
  assert.deepEqual(rules.map(({ userId, action, role }) => ({ userId, action, role })), [
    { userId: owner.teacherId, action: "exclude", role: "assistant" },
    { userId: wang.teacherId, action: "include", role: "teacher" },
  ]);
  assert.equal(resolveSessionLeadTeacher({
    courseTeachers: [owner], mode: "inherit", leadTeacherId: wang.teacherId,
    rules: rules.map((rule) => ({ teacherId: rule.userId, teacherName: rule.displayName, action: rule.action })),
  })?.teacherId, wang.teacherId);
});

test("custom rosters contain only the selected teachers and require explicit lead inclusion", () => {
  const rules = buildSessionTeacherRules({
    courseTeachers: [owner, wang], availableTeachers: [owner, wang],
    selectedTeacherIds: [wang.teacherId], leadTeacherId: wang.teacherId, mode: "custom",
  });
  assert.deepEqual(rules.map((rule) => [rule.userId, rule.action]), [[wang.teacherId, "include"]]);
  assert.equal(resolveSessionLeadTeacher({
    courseTeachers: [owner, wang], rules: [], mode: "custom", leadTeacherId: wang.teacherId,
  }), undefined);
});

test("organization aliases resolve to the roster identity and exclusions cannot be bypassed", () => {
  const legacy = { ...wang, teacherId: "school/azenglish" };
  assert.equal(resolveSessionLeadTeacher({
    courseTeachers: [legacy], rules: [], mode: "inherit", leadTeacherId: "azenglish",
  }), legacy);
  assert.equal(resolveSessionLeadTeacher({
    courseTeachers: [legacy], rules: [{ ...legacy, teacherId: "azenglish", action: "exclude" }],
    mode: "inherit", leadTeacherId: "school/azenglish",
  }), undefined);
});

test("an unselected temporary teacher produces no inclusion and is rejected as lead", () => {
  const rules = buildSessionTeacherRules({
    courseTeachers: [owner], availableTeachers: [owner, wang],
    selectedTeacherIds: [owner.teacherId], leadTeacherId: wang.teacherId, mode: "inherit",
  });
  assert.deepEqual(rules, []);
  assert.equal(resolveSessionLeadTeacher({
    courseTeachers: [owner], rules: [], mode: "inherit", leadTeacherId: wang.teacherId,
  }), undefined);
});
