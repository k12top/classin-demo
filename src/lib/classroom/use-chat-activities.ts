"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useClassroomSyncTask, useClassroomJsonRead } from "./use-classroom-sync";
import { type ActivityList, type ActivitySummary } from "./activities";

/** Keep active questions visible even when newer drafts fill the first history page. */
export function useChatActivities(sessionId: string, shareAccess: string | null | undefined, visible: boolean) {
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [error, setError] = useState(false), [pages, setPages] = useState(1);
  const [hasMore, setHasMore] = useState(false), [loading, setLoading] = useState(false);
  const read=useClassroomJsonRead(sessionId);
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
        const data = await read<ActivityList>(url.href, { signal });
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
  }, [sessionId, shareAccess, pages, read]);
  useClassroomSyncTask({sessionId,taskKey:`activity-feed:${shareAccess||''}:${pages}`,topics:['activities','resume'],wakeAt:Math.min(Infinity,...activities.filter(a=>a.status==='active'&&a.deadlineAt).map(a=>Date.parse(a.deadlineAt!))),active:visible&&Boolean(sessionId),run:signal=>reload(signal)});
  useEffect(()=>()=>{requestVersion.current++;},[reload,visible]);
  return { activities, error, reload, hasMore, loading, loadMore: () => setPages(value => value + 1) };
}
