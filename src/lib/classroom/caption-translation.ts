/** Paid work is never replayed after an unknown outcome. A saved result may be
 * committed again safely, without contacting the translation provider. */
export async function runClaimedCaptionTranslation<T>(input: {
  reserve(): Promise<boolean>;
  readSaved?(): Promise<T | null>;
  prepare?(): Promise<void>;
  beforeTranslate?(): Promise<void>;
  translate(): Promise<T>;
  saveResult?(value: T): Promise<void>;
  commit(value: T): Promise<void>;
  fail(stage: "prepare" | "translate"): Promise<void>;
}): Promise<"completed" | "reserved" | "failed"> {
  const restore = async () => {
    const saved = await input.readSaved?.();
    if (!saved) return false;
    await input.commit(saved);
    return true;
  };
  if (await restore()) return "completed";
  if (!await input.reserve()) return await restore() ? "completed" : "reserved";
  try { await input.prepare?.(); }
  catch { await input.fail("prepare"); return "failed"; }
  // Persist dispatch before issuing the external request. An abandoned preparing
  // claim is retryable by CAS; a requesting claim has an unknown paid outcome.
  await input.beforeTranslate?.();
  let translated: T;
  try { translated = await input.translate(); }
  catch { await input.fail("translate"); return "failed"; }
  await input.saveResult?.(translated);
  await input.commit(translated);
  return "completed";
}

export type CaptionTranslationState = "pending" | "failed" | "unknown" | "recoverable" | "completed";
export function captionTranslationState(payload: unknown, now = Date.now()): CaptionTranslationState {
  const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  if (value.state === "completed") return "completed";
  if (value.state === "translated") return "recoverable";
  if (value.state === "failed") return "failed";
  const at = typeof value.at === "string" ? Date.parse(value.at) : NaN;
  if (["preparing", "requesting"].includes(String(value.state)) && Number.isFinite(at) && now - at < 60_000) return "pending";
  return value.state === "preparing" ? "failed" : "unknown";
}
