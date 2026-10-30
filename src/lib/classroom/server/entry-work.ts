// Only merge work that is still running. Every request must pass its own
// authentication/access checks before calling this helper; no result is cached.
const pending = new Map<string, Promise<unknown>>();

export function shareClassroomEntryWork<T>(key: string | undefined, operation: () => Promise<T>): Promise<T> {
  if (!key) return operation();
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const work = Promise.resolve().then(operation).finally(() => {
    if (pending.get(key) === work) pending.delete(key);
  });
  pending.set(key, work);
  return work;
}
