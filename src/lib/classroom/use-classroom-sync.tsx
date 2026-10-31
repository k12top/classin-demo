"use client";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ACTIVITY_REFRESH_EVENT } from "./activities";
import { ClassroomSharedReads, ClassroomSyncScheduler } from "./sync-scheduler";

function createSync() { return { scheduler: new ClassroomSyncScheduler(), reads: new ClassroomSharedReads() }; }
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
