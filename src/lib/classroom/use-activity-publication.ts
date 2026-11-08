"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { validateActivity, type ActivityDetail } from "./activities";
import type { ActivityDraft } from "./activity-editor";
import { activityUrl, announceActivity } from "./use-activity-detail";

type Publication = { requestId: string; activity: ActivityDraft; createdAt: string; state: "sending" | "retry" | "failed" };

function loadPublications(key: string): Publication[] {
    if (typeof sessionStorage === "undefined") return [];
    try { return (JSON.parse(sessionStorage.getItem(key) || "[]") as Publication[]).filter(row => {
      validateActivity(row.activity); return /^[\w-]{8,100}$/.test(row.requestId) && Number.isFinite(Date.parse(row.createdAt));
    }).map(row => ({ ...row, state: "retry" })); } catch { return []; }
}

/** Preserve an uncertain send and its idempotency key through retries/reloads.
 * A pending card never claims that students have received the question. */
export function useActivityPublication(sessionId: string, userId: string, shareAccess: string | null | undefined, onChanged: (revision: number) => void, confirmed: readonly { requestId?: string }[] = []) {
  const key = `activity-publication:${sessionId}:${userId}`;
  const [pending, setPending] = useState<Publication[]>(() => loadPublications(key));
  const [created, setCreated] = useState<ActivityDetail[]>([]);
  const [owner, setOwner] = useState(key);
  if (owner !== key) { setOwner(key); setPending(loadPublications(key)); setCreated([]); }
  else if (pending.some(row => confirmed.some(item => item.requestId === row.requestId))) {
    // A successful authorized list read is also a durable receipt. Do not
    // block the next question while a lost POST acknowledgement times out.
    setPending(pending.filter(row => !confirmed.some(item => item.requestId === row.requestId)));
  }
  const running = useRef(new Set<string>()), active = useRef(true), controllers = useRef(new Map<string, AbortController>());
  const latest = useRef({ pending, onChanged });
  useLayoutEffect(() => { latest.current = { pending, onChanged }; }, [pending, onChanged]);
  useEffect(() => {
    active.current = true;
    const requests = controllers.current, runningIds = running.current;
    return () => { active.current = false; for (const controller of requests.values()) controller.abort(); requests.clear(); runningIds.clear(); };
  }, [key]);
  useEffect(() => { try { if (pending.length) sessionStorage.setItem(key, JSON.stringify(pending)); else sessionStorage.removeItem(key); } catch {} }, [key, pending]);
  const send = useCallback(async (row: Publication) => {
    if (running.current.has(row.requestId)) return;
    running.current.add(row.requestId);
    const controller = new AbortController(); controllers.current.set(row.requestId, controller);
    setPending(rows => rows.map(item => item.requestId === row.requestId ? { ...item, state: "sending" } : item));
    try {
      const response = await fetch(activityUrl(sessionId), { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity: row.activity, start: true, requestId: row.requestId, shareAccess }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      const result = await response.json() as { revision: number; activity?: ActivityDetail };
      if (!response.ok) throw Object.assign(new Error("activity_publish_failed"), { permanent: response.status < 500 && response.status !== 408 && response.status !== 429 });
      if (!active.current || controller.signal.aborted) return;
      if (result.activity) setCreated(rows => [...rows.filter(item => item.id !== result.activity!.id), result.activity!]);
      setPending(rows => rows.filter(item => item.requestId !== row.requestId));
      announceActivity(sessionId, result.revision, latest.current.onChanged);
    } catch (error) {
      if (active.current && !controller.signal.aborted) setPending(rows => rows.map(item => item.requestId === row.requestId ? { ...item, state: (error as { permanent?: boolean })?.permanent ? "failed" : "retry" } : item));
    } finally { controllers.current.delete(row.requestId); running.current.delete(row.requestId); }
  }, [sessionId, shareAccess]);
  useEffect(() => {
    const retry = () => { const row = latest.current.pending[0]; if (navigator.onLine && row?.state === "retry") void send(row); };
    const timer = setInterval(retry, 4000); window.addEventListener("online", retry);
    return () => { clearInterval(timer); window.removeEventListener("online", retry); };
  }, [send]);
  const publish = (activity: ActivityDraft) => {
    if (latest.current.pending.length) return;
    const row: Publication = { requestId: crypto.randomUUID(), activity, createdAt: new Date().toISOString(), state: "sending" };
    // Persist before the network operation, so an immediate refresh is safe.
    const rows = [...latest.current.pending, row];
    try { sessionStorage.setItem(key, JSON.stringify(rows)); } catch {}
    latest.current = { ...latest.current, pending: rows };
    setPending(rows); void send(row);
  };
  return { pending, created, publish, retry: send };
}
