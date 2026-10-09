export type ClassroomClosingNotice = {
  closesAt: string;
  remainingSeconds: number;
  phase: "grace" | "warning" | "final" | "closing";
};

/** Display the server's actual deadline, without ending the media locally. */
export function classroomClosingNotice(input: {
  scheduledEndTime: string | null | undefined;
  graceEndsAt: string | null | undefined;
  status: string | undefined;
  now: number;
}): ClassroomClosingNotice | null {
  if (input.status === "ended" || !input.scheduledEndTime || !input.graceEndsAt) return null;
  const end = Date.parse(input.scheduledEndTime);
  const close = Date.parse(input.graceEndsAt);
  if (!Number.isFinite(end) || !Number.isFinite(close) || !Number.isFinite(input.now) || close < end || input.now < end) return null;
  const remainingSeconds = Math.max(0, Math.ceil((close - input.now) / 1000));
  return {
    closesAt: input.graceEndsAt,
    remainingSeconds,
    phase: remainingSeconds === 0 ? "closing" : remainingSeconds <= 60 ? "final" : remainingSeconds <= 300 ? "warning" : "grace",
  };
}

export function classroomClosingClock(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
