export type ClassStartMode = "manual" | "scheduled";

export function normalizeClassStartMode(value: unknown): ClassStartMode {
  return value === "scheduled" ? "scheduled" : "manual";
}

export function scheduledClassStartDue(mode: string, startTime: Date, endTime: Date, now: Date) {
  return mode === "scheduled" && now.getTime() >= startTime.getTime() && now.getTime() < endTime.getTime();
}

export function classStartReadiness(input: {
  isTeacher: boolean; isRecorder: boolean; pageReady: boolean;
  mediaConnected: boolean; whiteboardRequired: boolean; whiteboardReady: boolean;
}) {
  return input.isTeacher && !input.isRecorder && input.pageReady && input.mediaConnected &&
    (!input.whiteboardRequired || input.whiteboardReady);
}

export function classStartLateness(startTime: string | null, now: number): number | null {
  const start = startTime ? Date.parse(startTime) : NaN;
  return Number.isFinite(start) && now >= start ? Math.floor((now - start) / 60_000) : null;
}
