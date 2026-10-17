import type { SummaryGenerationState } from "./course-session-summary-generation";

type Summary = { sessionId: string; generatedBy?: string; isStale?: boolean; updatedAt: string };
export type SummaryStatusPayload<T extends Summary = Summary> = {
  summary: T | null;
  generation?: SummaryGenerationState | null;
  canManage?: boolean;
};

export function summaryGenerationActive(generation: SummaryGenerationState | null | undefined) {
  return generation?.status === "queued" || generation?.status === "running";
}

/** Metadata-only polling never reloads the transcript or waits on model requests. */
export async function watchCourseSessionSummary<T extends Summary>({ sessionId, ended, signal, onStatus, onUnavailable,
  fetchImpl = fetch, intervalMs = 2_000 }: {
  sessionId: string; ended: boolean; signal: AbortSignal;
  onStatus: (status: SummaryStatusPayload<T>) => void;
  onUnavailable: () => void;
  fetchImpl?: typeof fetch; intervalMs?: number;
}) {
  const url = `/api/sessions/${encodeURIComponent(sessionId)}/summary`;
  let ensured = false;
  let failures = 0;
  while (!signal.aborted) {
    try {
      const response = await fetchImpl(`${url}?summaryOnly=1`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) { onUnavailable(); return; }
        throw new Error("summary_status_unavailable");
      }
      let payload = await response.json() as SummaryStatusPayload<T>;
      failures = 0;
      if (signal.aborted) return;
      const needsSummary = !payload.summary || (payload.summary.isStale && payload.summary.generatedBy === "system");
      if (ended && payload.canManage && needsSummary && !payload.generation && !ensured) {
        // Recover a lost end-class callback without requiring the teacher to click.
        ensured = true;
        const queued = await fetchImpl(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ensure" }), signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
        if (!queued.ok) throw new Error("summary_queue_unavailable");
        payload = await queued.json() as SummaryStatusPayload<T>;
        if (!payload.generation) ensured = false; // Final captions may still be arriving.
      }
      if (signal.aborted) return;
      onStatus(payload);
      if (!summaryGenerationActive(payload.generation) && !needsSummary) return;
      if (!ended && !summaryGenerationActive(payload.generation)) return;
    } catch {
      if (signal.aborted) return;
      failures++;
      // A transient status read must not turn a successful generation into a failure.
      if (failures >= 3) onUnavailable();
    }
    await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
      const timer = setTimeout(finish, intervalMs);
      signal.addEventListener("abort", finish, { once: true });
    });
  }
}
