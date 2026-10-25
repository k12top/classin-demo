export type LessonPhase = "waiting" | "ready" | "live" | "overtime" | "closing" | "ended";
export type LessonClock = { phase: LessonPhase; tone: "neutral" | "active" | "warning" | "danger"; seconds: number | null; elapsed: number | null; overtime: number; remainingGrace: number | null };

/** Runtime status and server-adjusted time are authoritative; never end media locally. */
export function lessonClock(input: { status: "waiting" | "live" | "ended"; startTime?: string | null; endTime?: string | null; startedAt?: string | null; graceEndsAt?: string | null; now: number }): LessonClock {
  const date = (value?: string | null) => { const result = value ? Date.parse(value) : NaN; return Number.isFinite(result) ? result : null; };
  const start = date(input.startTime), end = date(input.endTime), began = date(input.startedAt), grace = date(input.graceEndsAt);
  const now = Number.isFinite(input.now) ? input.now : 0;
  const base = { elapsed: null, overtime: 0, remainingGrace: null };
  if (input.status === "ended") return { ...base, phase: "ended", tone: "neutral", seconds: null };
  if (input.status === "waiting") {
    const due = start !== null && now >= start;
    return { ...base, phase: due ? "ready" : "waiting", tone: due ? "warning" : "neutral", seconds: start === null ? null : Math.floor(Math.abs(now - start) / 1000) };
  }
  const elapsed = began === null ? null : Math.max(0, Math.floor((now - began) / 1000));
  if (end !== null && now >= end) {
    const overtime = Math.max(0, Math.floor((now - end) / 1000));
    const remainingGrace = grace !== null && grace >= end ? Math.max(0, Math.ceil((grace - now) / 1000)) : null;
    const closing = remainingGrace !== null && remainingGrace <= 60;
    return { phase: closing ? "closing" : "overtime", tone: closing ? "danger" : "warning", seconds: overtime, elapsed, overtime, remainingGrace };
  }
  return { phase: "live", tone: "active", seconds: elapsed, elapsed, overtime: 0, remainingGrace: null };
}

export function lessonClockText(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds)), hours = Math.floor(value / 3600);
  const clock = `${String(Math.floor(value / 60) % 60).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  return hours ? `${hours}:${clock}` : clock;
}
