"use client";

import { useEffect } from "react";

/** Only a ready lead-teacher page runs this scheduler. The server checks the policy and connection again. */
export function useScheduledClassStart({ enabled, startTime, endTime, clockOffset, onStart }: {
  enabled: boolean; startTime: string | null; endTime: string | null;
  clockOffset: number; onStart: () => Promise<unknown>;
}) {
  useEffect(() => {
    const start = startTime ? Date.parse(startTime) : NaN;
    const end = endTime ? Date.parse(endTime) : NaN;
    if (!enabled || !Number.isFinite(start) || !Number.isFinite(end)) return;
    let cancelled = false, inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      clearTimeout(timer);
      if (cancelled || inFlight) return;
      const now = Date.now() + clockOffset;
      if (now >= end) return;
      if (now < start) { timer = setTimeout(() => void check(), Math.min(start - now, 60_000)); return; }
      inFlight = true;
      try { await onStart(); }
      catch { /* The action handler presents the error; keep retrying while ready. */ }
      finally {
        inFlight = false;
        if (!cancelled) timer = setTimeout(() => void check(), 5_000);
      }
    };
    const wake = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); };
  }, [enabled, startTime, endTime, clockOffset, onStart]);
}
