"use client";

/**
 * A deliberately small, per-tab cache for course details.
 *
 * The dashboard already preloads route code on hover. Keeping the matching
 * course response for a short period means opening that route does not need
 * to show a full-page loading state a second time. This is memory-only: a
 * refresh still asks the server for the authoritative roster and permissions.
 */
const COURSE_DETAIL_TTL_MS = 90_000;

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const courseDetails = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<unknown | null>>();

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return Boolean(entry && entry.expiresAt > Date.now());
}

export function readCourseDetailCache<T>(courseId: string): T | null {
  const entry = courseDetails.get(courseId);
  if (!isFresh(entry)) {
    if (entry) courseDetails.delete(courseId);
    return null;
  }
  return entry.value as T;
}

export function writeCourseDetailCache<T>(courseId: string, value: T): T {
  courseDetails.set(courseId, {
    value,
    expiresAt: Date.now() + COURSE_DETAIL_TTL_MS,
  });
  return value;
}

/**
 * Warm a course detail response without changing navigation state. Errors are
 * intentionally swallowed: a normal route visit will still make the
 * authenticated, retry-capable request and render its own error state.
 */
export function prefetchCourseDetail(courseId: string): Promise<unknown | null> {
  if (!courseId) return Promise.resolve(null);

  const cached = readCourseDetailCache(courseId);
  if (cached) return Promise.resolve(cached);

  const pending = pendingRequests.get(courseId);
  if (pending) return pending;

  const request = fetch(`/api/courses/${encodeURIComponent(courseId)}`, {
    credentials: "same-origin",
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = (await response.json()) as { course?: unknown };
      if (!payload.course) return null;
      return writeCourseDetailCache(courseId, payload.course);
    })
    .catch(() => null)
    .finally(() => {
      pendingRequests.delete(courseId);
    });

  pendingRequests.set(courseId, request);
  return request;
}
