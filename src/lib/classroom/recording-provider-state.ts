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
  return {
    ...recordingProviderStateRecord(current),
    [key]: value,
  };
}
