export function canAutoStartRecordingAtStatus(
  mode: string,
  status: string,
) {
  return status !== "ended" &&
    (mode === "pageReady" || (mode === "classStart" && status === "live"));
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
