import { casdoorUserIdsMatch } from "./casdoor-user";

export type SessionTeacher = {
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
};

type DirectoryTeacher = {
  id: string;
  casdoorUuid?: string | null;
  name: string;
  displayName: string;
  avatar?: string;
};

/** Keep existing course identities; new teacher assignments use the auth UUID. */
export function sessionTeacherFromDirectory(
  user: DirectoryTeacher,
  teachers: SessionTeacher[],
): SessionTeacher {
  const aliases = [user.casdoorUuid, user.id, user.name].filter(
    (id): id is string => Boolean(id),
  );
  const existing = teachers.find((teacher) =>
    aliases.some((id) => casdoorUserIdsMatch(teacher.teacherId, id)),
  );
  return existing || {
    teacherId: user.casdoorUuid?.trim() || user.id.trim(),
    teacherName: user.displayName || user.name || user.id,
    teacherAvatar: user.avatar || "",
  };
}

/** Inherit saved teachers, exclude unchecked ones, explicitly include additions. */
export function buildSessionTeacherRules(input: {
  courseTeachers: SessionTeacher[];
  availableTeachers: SessionTeacher[];
  selectedTeacherIds: string[];
  leadTeacherId: string;
  mode: "inherit" | "custom";
}) {
  return input.availableTeachers.flatMap((teacher) => {
    const selected = input.selectedTeacherIds.some((id) =>
      casdoorUserIdsMatch(teacher.teacherId, id),
    );
    const inherited = input.mode === "inherit" && input.courseTeachers.some(
      (item) => casdoorUserIdsMatch(item.teacherId, teacher.teacherId),
    );
    if (selected === inherited) return [];
    return [{
      userId: teacher.teacherId,
      displayName: teacher.teacherName,
      avatar: teacher.teacherAvatar || "",
      action: selected ? "include" : "exclude",
      role: casdoorUserIdsMatch(teacher.teacherId, input.leadTeacherId) ? "teacher" : "assistant",
    }];
  });
}

/** Apply the same identity matching to creation and editing of lesson rosters. */
export function resolveSessionLeadTeacher(input: {
  courseTeachers: SessionTeacher[];
  mode: "inherit" | "custom";
  rules: Array<SessionTeacher & { action: string }>;
  leadTeacherId: string;
}): SessionTeacher | undefined {
  let teachers = input.mode === "inherit" ? [...input.courseTeachers] : [];
  for (const rule of input.rules) {
    teachers = teachers.filter((teacher) =>
      !casdoorUserIdsMatch(teacher.teacherId, rule.teacherId),
    );
    if (rule.action !== "exclude") teachers.push(rule);
  }
  return teachers.find((teacher) =>
    casdoorUserIdsMatch(teacher.teacherId, input.leadTeacherId),
  );
}
