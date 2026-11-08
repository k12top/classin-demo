"use client";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ACTIVITY_REFRESH_EVENT } from "./activities";
import { ClassroomSharedReads, ClassroomSyncScheduler } from "./sync-scheduler";

function createSync() { return { scheduler: new ClassroomSyncScheduler(), reads: new ClassroomSharedReads(), activityVersions: new Map<string, { users: number; remove: () => void }>() }; }
type Sync = ReturnType<typeof createSync>;
const Context = createContext<Sync | null>(null);
export const ClassroomSyncProvider = Context.Provider;

export function useClassroomSyncOwner(sessionId: string, active: boolean) {
  const [sync] = useState(createSync);
  useEffect(() => {
    if (!active) return;
    const environment = () => sync.scheduler.environment(navigator.onLine, document.visibilityState === "visible");
    const resume = () => sync.scheduler.environment(navigator.onLine, document.visibilityState === "visible", true);
    const activity = (event: Event) => { const id = (event as CustomEvent).detail?.sessionId; if (!id || id === sessionId) sync.scheduler.invalidate("activities"); };
    environment(); sync.scheduler.start();
    document.addEventListener("visibilitychange", environment); window.addEventListener("online", environment); window.addEventListener("offline", environment);
    window.addEventListener("pageshow", resume); window.addEventListener("focus", resume); window.addEventListener(ACTIVITY_REFRESH_EVENT, activity);
    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
    connection?.addEventListener("change", resume);
    return () => {
      document.removeEventListener("visibilitychange", environment); window.removeEventListener("online", environment); window.removeEventListener("offline", environment);
      window.removeEventListener("pageshow", resume); window.removeEventListener("focus", resume); window.removeEventListener(ACTIVITY_REFRESH_EVENT, activity);
      connection?.removeEventListener("change", resume); sync.scheduler.stop(); sync.reads.stop();
    };
  }, [active, sessionId, sync]);
  return sync;
}

function useSync(sessionId: string) {
  const shared = useContext(Context);
  // Management/review pages can use the same hooks outside the live classroom.
  const fallback = useClassroomSyncOwner(sessionId, !shared);
  return shared || fallback;
}
export function ClassroomSyncBoundary({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const sync = useSync(sessionId);
  return <ClassroomSyncProvider value={sync}>{children}</ClassroomSyncProvider>;
}

export function useClassroomSyncTask(input: {
  sessionId: string; taskKey: string; topics: string[]; run: (signal: AbortSignal) => Promise<unknown>;
  active?: boolean; realtimeMs?: number | null; fallbackMs?: number | null; background?: boolean;
  wakeAt?: number;
}) {
  const sync = useSync(input.sessionId), latest = useRef(input);
  useLayoutEffect(() => { latest.current = input; });
  const { active = true, realtimeMs = 60_000, fallbackMs = 5_000, background = false, taskKey, wakeAt } = input;
  useEffect(() => {
    if (!active) return;
    return sync.scheduler.register({ topics: [...latest.current.topics, ...((realtimeMs !== null || fallbackMs !== null) ? ["transport"] : [])], run: signal => latest.current.run(signal),
      interval: ready => ready ? realtimeMs : fallbackMs, background, wakeAt });
  }, [sync, input.sessionId, taskKey, active, realtimeMs, fallbackMs, background, wakeAt]);
  return sync;
}

export function useClassroomJsonRead(sessionId: string) {
  const sync = useSync(sessionId);
  return useCallback(async function read<T>(url: string, init?: RequestInit): Promise<T> {
    const load = async (signal: AbortSignal) => {
      const response = await fetch(url, { cache: "no-store", ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
      const value = await response.json().catch(() => null);
      if (!response.ok || !value) throw new Error(value?.error || `HTTP ${response.status}`);
      return value as T;
    };
    if (init?.method && init.method !== "GET") return load(init.signal || new AbortController().signal);
    const key = JSON.stringify([new URL(url, location.origin).href, [...new Headers(init?.headers)].sort(), init?.credentials]);
    // Paginated consumers append to their own arrays; sharing a request must
    // never let one widget mutate another widget's response object.
    return structuredClone(await sync.reads.read(key, load, init?.signal));
  }, [sync]);
}

/** One lightweight durable-version check per authorized classroom view, shared
 * by every card. It repairs a lost RTM event or a lost mutation response without
 * polling every question's roster and answers every two seconds. */
export function useActivityVersionWatch(sessionId: string, shareAccess?: string | null, active = true) {
  const sync = useSync(sessionId);
  useEffect(() => {
    if (!active || !sessionId) return;
    const params = new URLSearchParams({ versionOnly: "1" });
    if (shareAccess) params.set("shareAccess", shareAccess);
    const url = `/api/sessions/${encodeURIComponent(sessionId)}/classroom/activities?${params}`;
    let entry = sync.activityVersions.get(url);
    if (!entry) {
      let revision: number | undefined;
      const remove = sync.scheduler.register({ topics: ["transport", "resume"], interval: () => 2000, maxRetryMs: 8000,
        run: async signal => {
          const value = await sync.reads.read(url, async readSignal => {
            const response = await fetch(url, { cache: "no-store", signal: AbortSignal.any([readSignal, AbortSignal.timeout(8000)]) });
            if (!response.ok) throw new Error("activity_version_unavailable");
            return response.json() as Promise<{ revision: number }>;
          }, signal);
          if (!Number.isSafeInteger(value.revision)) throw new Error("invalid_activity_version");
          if (revision !== value.revision) sync.scheduler.invalidate("activities");
          revision = value.revision;
        } });
      entry = { users: 0, remove }; sync.activityVersions.set(url, entry);
    }
    entry.users++;
    return () => { if (--entry.users === 0) { entry.remove(); sync.activityVersions.delete(url); } };
  }, [sync, sessionId, shareAccess, active]);
}
