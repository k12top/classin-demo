"use client";

import { useTimeZone } from "@/lib/use-time-zone";
import { zonedDateKey, parseZonedInput } from "@/lib/time-zone";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type TeacherScheduleSummary,
} from "@/lib/teacher-schedule";

type ScheduleResponse = {
  schedules?: TeacherScheduleSummary[];
  error?: string;
};

const scheduleCache = new Map<string, { expiresAt: number; data: Record<string, TeacherScheduleSummary> }>();
const CACHE_MS = 30_000;

export function useTeacherSchedules(
  teacherIds: string[],
  options: { enabled?: boolean; days?: number } = {},
) {
  const { timeZone } = useTimeZone();
  const enabled = options.enabled ?? true;
  const days = options.days ?? 7;
  const idsKey = Array.from(new Set(teacherIds.filter(Boolean))).sort().join("|");
  const stableIds = useMemo(() => idsKey.split("|").filter(Boolean), [idsKey]);
  const [revision, setRevision] = useState(0);
  const [schedules, setSchedules] = useState<Record<string, TeacherScheduleSummary>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const range = useMemo(() => {
    const today = zonedDateKey(new Date(), timeZone);
    const end = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    try { return { from: parseZonedInput(`${today}T00:00`, timeZone), to: parseZonedInput(`${end}T00:00`, timeZone) }; }
    catch { // Include the entire range when a region changes its clock at midnight.
      return { from: new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000), to: new Date(Date.parse(`${end}T00:00:00Z`) + 86_400_000) };
    }
  }, [days, timeZone]);

  useEffect(() => {
    if (!enabled || !stableIds.length) {
      return;
    }
    const cacheKey = `${idsKey}:${range.from.toISOString()}:${range.to.toISOString()}`;
    const cached = scheduleCache.get(cacheKey);
    const controller = new AbortController();
    if (revision === 0 && cached && cached.expiresAt > Date.now()) {
      queueMicrotask(() => {
        if (controller.signal.aborted) return;
        setSchedules(cached.data);
        setLoading(false);
      });
      return () => controller.abort();
    }

    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError("");
    });
    const params = new URLSearchParams({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    });
    stableIds.forEach((teacherId) => params.append("teacherId", teacherId));
    void fetch(`/api/teachers/schedule?${params.toString()}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as ScheduleResponse;
        if (!response.ok) throw new Error(payload.error || "Failed to load teacher schedule");
        const next = Object.fromEntries(
          (payload.schedules || []).map((summary) => [summary.teacherId, summary]),
        );
        scheduleCache.set(cacheKey, { expiresAt: Date.now() + CACHE_MS, data: next });
        setSchedules(next);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Failed to load teacher schedule");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, idsKey, range.from, range.to, revision, stableIds]);

  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  return { schedules, loading, error, refresh, range };
}
