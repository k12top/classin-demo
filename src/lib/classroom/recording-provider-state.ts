import {recordingFileStartTimes} from "./recording-playback-timeline";

export function recordingProviderStateRecord(
  value: unknown,
): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Provider query, stop and webhook responses do not repeat the immutable
 * recording context (mode, storage prefix, acquire response). Keep that
 * context at the root and store each transient response under a named key.
 */
export function appendRecordingProviderState(
  current: unknown,
  key: "lastQuery" | "lastStop" | "lastWebhook",
  value: unknown,
): Record<string, unknown> {
  const state=recordingProviderStateRecord(current);
  const prefix=Array.isArray(state.fileNamePrefix)?state.fileNamePrefix.filter((part):part is string=>typeof part==="string"):[];
  const fileStartTimes=recordingFileStartTimes({previous:state,incoming:value},prefix);
  return {
    ...state,
    [key]: value,
    ...(Object.keys(fileStartTimes).length?{fileStartTimes}:{}),
  };
}
