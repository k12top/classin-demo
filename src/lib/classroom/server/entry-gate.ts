function busy() {
  return Object.assign(new Error("Classroom entry queue is busy"), { code: "ENTRY_BUSY" });
}

/** Per-process pressure bound, not a distributed room capacity limit. */
export function createClassroomEntryGate(concurrency = 2, queueLimit = 32, waitMs = 6_000) {
  let active = 0;
  const waiting: Array<{ grant: (release: () => void) => void; timer: ReturnType<typeof setTimeout> }> = [];
  function release() {
    active--;
    const next = waiting.shift();
    if (next) { clearTimeout(next.timer); active++; next.grant(release); }
  }
  async function acquire(): Promise<() => void> {
    if (active < concurrency) { active++; return release; }
    if (waiting.length >= queueLimit) throw busy();
    return new Promise((resolve, reject) => {
      const entry = { grant: resolve, timer: setTimeout(() => {
        const index = waiting.indexOf(entry);
        if (index >= 0) waiting.splice(index, 1);
        reject(busy());
      }, waitMs) };
      waiting.push(entry);
    });
  }
  return async function run<T>(operation: () => Promise<T>): Promise<T> {
    const done = await acquire();
    try { return await operation(); }
    finally { done(); }
  };
}

const configuredPoolMax = Number(process.env.DATABASE_POOL_MAX || 10);
const poolMax = Number.isInteger(configuredPoolMax) && configuredPoolMax > 0 ? configuredPoolMax : 10;
// Leave room for state reads, leave and activity requests alongside entry.
export const withClassroomEntrySlot = createClassroomEntryGate(Math.max(1, Math.min(4, poolMax - 2)));
