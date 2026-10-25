"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ACTIVITY_REFRESH_EVENT, type ActivityList, type ActivitySummary } from "./activities";

/** Keep active questions visible even when newer drafts fill the first history page. */
export function useChatActivities(sessionId: string, shareAccess: string | null | undefined, visible: boolean) {
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [error, setError] = useState(false), [pages, setPages] = useState(1);
  const [hasMore, setHasMore] = useState(false), [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!sessionId) return;
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const rows = new Map<string, ActivitySummary>();
      let cursor: string | null = null;
      for (let page = 0; page < pages; page++) {
        const url = new URL(`/api/sessions/${encodeURIComponent(sessionId)}/classroom/activities`, location.origin);
        if (shareAccess) url.searchParams.set("shareAccess", shareAccess);
        if (cursor) url.searchParams.set("cursor", cursor);
        const response = await fetch(url, { cache: "no-store", signal });
        if (!response.ok) throw new Error("activities_unavailable");
        const data = await response.json() as ActivityList;
        for (const row of [...data.activities, ...(data.active ? [data.active] : [])]) {
          if (row.startedAt && row.status !== "draft") rows.set(row.id, row);
        }
        cursor = data.nextCursor;
        if (!cursor) break;
      }
      signal?.throwIfAborted();
      if (requestVersion.current !== version) return;
      setActivities([...rows.values()].sort((a, b) => Date.parse(b.startedAt || b.createdAt) - Date.parse(a.startedAt || a.createdAt)));
      setHasMore(Boolean(cursor)); setError(false);
    } catch (failure) {
      if (!signal?.aborted && requestVersion.current === version) setError(true);
      throw failure;
    } finally { if (requestVersion.current === version) setLoading(false); }
  }, [sessionId, shareAccess, pages]);
  useEffect(() => {
    if (!visible || !sessionId) return;
    const controller = new AbortController(); let running = false, queued = false;
    const refresh = () => {
      if (running) { queued = true; return; }
      running = true;
      void reload(controller.signal).catch(() => undefined).finally(() => {
        running = false;
        if (queued && !controller.signal.aborted) { queued = false; refresh(); }
      });
    };
    const changed = (event: Event) => { const detail = (event as CustomEvent).detail; if (!detail?.sessionId || detail.sessionId === sessionId) refresh(); };
    refresh(); const timer = setInterval(refresh, 8000);
    window.addEventListener(ACTIVITY_REFRESH_EVENT, changed); window.addEventListener("online", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener(ACTIVITY_REFRESH_EVENT, changed); window.removeEventListener("online", refresh); };
  }, [reload, sessionId, visible]);
  return { activities, error, reload, hasMore, loading, loadMore: () => setPages(value => value + 1) };
}
