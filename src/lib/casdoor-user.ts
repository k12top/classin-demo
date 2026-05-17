/**
 * Stable Casdoor user identifiers — align session, search, and DB assignments.
 * Casdoor login name (`name`) is stable; JWT `id` (UUID) may differ from API list `id`.
 */

export type CasdoorIdentity = {
  id?: string;
  name?: string;
  sub?: string;
  owner?: string;
  groups?: string[] | null;
};

/** Casdoor login name — use for student enrollment keys. */
export function resolveCasdoorUserId(user: CasdoorIdentity): string {
  if (user.name?.trim()) return user.name.trim();
  if (user.id?.trim()) return user.id.trim();
  if (user.sub?.trim()) return user.sub.trim();
  return "";
}

/** Session user id: teachers keep UUID when present (legacy courses); students use login name. */
export function resolveSessionUserId(
  user: CasdoorIdentity,
  role: "teacher" | "student"
): string {
  const loginName = resolveCasdoorUserId(user);
  if (role === "teacher") {
    return user.id?.trim() || loginName;
  }
  return loginName || user.id?.trim() || "";
}

/** Match teacher/student IDs across UUID vs login name vs org/name. */
export function casdoorUserIdsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const strip = (s: string) => (s.includes("/") ? s.split("/").pop()! : s);
  return strip(a) === strip(b);
}

export function isTeacherGroupMember(groups: string[] | null | undefined): boolean {
  if (!groups?.length) return false;
  return groups.some((g) => /teacher|教师|老师/i.test(g));
}

export function isStudentGroupMember(groups: string[] | null | undefined): boolean {
  if (!groups?.length) return false;
  return groups.some((g) => /student|学生/i.test(g));
}
