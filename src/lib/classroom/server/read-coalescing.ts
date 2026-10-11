const pending = new Map<string, Promise<unknown>>();

/** Share concurrent reads only. No TTL cache can hide a moderation change. */
export function coalesceClassroomRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  if (pending.size >= 1_000) return read();
  const result = Promise.resolve().then(read).finally(() => {
    if (pending.get(key) === result) pending.delete(key);
  });
  pending.set(key, result);
  return result;
}
