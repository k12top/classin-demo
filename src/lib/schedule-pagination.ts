/** Page by lessons rather than days, so a busy day cannot grow without limit. */
export function paginateScheduleGroups<T>(groups: ReadonlyArray<readonly [string, readonly T[]]>, requestedPage: number, size = 5) {
  const pageSize = Math.max(1, Math.trunc(size) || 5);
  const entries = groups.flatMap(([day, lessons]) => lessons.map(lesson => ({ day, lesson })));
  const pages = Math.max(1, Math.ceil(entries.length / pageSize));
  const page = Math.min(Math.max(0, Math.trunc(requestedPage) || 0), pages - 1);
  const result = new Map<string, T[]>();
  for (const { day, lesson } of entries.slice(page * pageSize, (page + 1) * pageSize)) {
    const lessons = result.get(day) || [];
    lessons.push(lesson); result.set(day, lessons);
  }
  return { groups: [...result], page, pages, total: entries.length };
}
