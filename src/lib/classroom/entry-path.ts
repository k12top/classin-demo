/** Keep course and exact-session references separate at the entry boundary. */
export function classroomVerifyAccessPath(courseId: string, sessionId?: string) {
  const path = `/api/courses/${encodeURIComponent(courseId)}/verify-access`;
  return sessionId ? `${path}?${new URLSearchParams({ sessionId })}` : path;
}

/** Resolve old course-only URLs once before media and polling use the scope ID. */
export function canonicalClassroomEntryPath(search: string, sessionId: string) {
  const params = new URLSearchParams(search);
  if (params.get("sessionId") || !params.get("courseId") || !sessionId) return null;
  params.delete("courseId");
  params.set("sessionId", sessionId);
  return `/classroom?${params}`;
}
