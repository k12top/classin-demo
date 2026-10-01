export type RecordingStartMode = "classStart" | "scheduled" | "scheduledEarly" | "disabled";

export function normalizeRecordingStartMode(mode: string): RecordingStartMode {
  return mode === "scheduled" || mode === "scheduledEarly" || mode === "disabled" ? mode : "classStart";
}

export function scheduledClassStartDue(
  mode: string,
  startTime: Date,
  endTime: Date,
  now: Date,
) {
  const leadMs = mode === "scheduledEarly" ? 10 * 60_000 : 0;
  return (mode === "scheduled" || mode === "scheduledEarly") &&
    now.getTime() >= startTime.getTime() - leadMs &&
    now.getTime() < endTime.getTime();
}

export function canAutoStartRecordingAtStatus(
  mode: string,
  status: string,
) {
  return status === "live" &&
    (mode === "classStart" || mode === "scheduled" ||
      mode === "scheduledEarly" || mode === "pageReady");
}

export function shouldAutoStartRecordingAfterWhiteboard(input: {
  isRecorder: boolean;
  pageReady: boolean;
  mediaConnected: boolean;
  whiteboardEnabled: boolean;
  whiteboardReady: boolean;
  isTeacher: boolean;
  mode: string;
  status: string;
}) {
  return !input.isRecorder && input.pageReady && input.mediaConnected &&
    input.whiteboardEnabled && input.whiteboardReady && input.isTeacher &&
    canAutoStartRecordingAtStatus(input.mode, input.status);
}

export function shouldNotifyRecorderReady(input: {
  pageReady: boolean;
  mediaConnected: boolean;
  whiteboardEnabled: boolean;
  whiteboardReady: boolean;
  whiteboardRequired?: boolean;
}) {
  return input.pageReady && input.mediaConnected &&
    (input.whiteboardRequired === false || (input.whiteboardEnabled && input.whiteboardReady));
}

/** 202 means provider startup is still pending and must be retried. */
export function isRecorderReadyAcknowledged(status: number, state: unknown): boolean {
  return status === 200 && state === "ready";
}
