export type RecordingRecoveryCandidate = {
  status: string;
  failureStage: string | null;
  stopRequestedAt: Date | null;
  retryCount: number;
};

/**
 * Only recover failures that were not explicitly stopped by a teacher. A
 * provider stop failure must never cause a new recorder to start again.
 */
export function shouldRecoverRecording(
  recording: RecordingRecoveryCandidate | null | undefined,
  maxRetries: number,
): boolean {
  return Boolean(
    recording &&
      recording.status === "failed" &&
      !recording.stopRequestedAt &&
      (recording.failureStage === "start" ||
        recording.failureStage === "runtime") &&
      recording.retryCount < maxRetries,
  );
}
