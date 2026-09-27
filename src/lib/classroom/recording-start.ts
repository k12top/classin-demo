export type RecordingStartMode = "classStart" | "scheduled" | "scheduledEarly";

export function normalizeRecordingStartMode(mode: string): RecordingStartMode {
  return mode === "scheduled" || mode === "scheduledEarly" ? mode : "classStart";
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
}) {
  return input.pageReady && input.mediaConnected &&
    (!input.whiteboardEnabled || input.whiteboardReady);
}
