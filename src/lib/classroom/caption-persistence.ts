import type { ClassroomCaptionInput } from "./types";
import { mergeCaptionInput } from "./caption-merge";

export interface CaptionPersistenceStore {
  read(): ClassroomCaptionInput[];
  write(caption: ClassroomCaptionInput): void;
  acknowledge(caption: ClassroomCaptionInput): void;
}

export function captionFingerprint(caption: ClassroomCaptionInput) {
  return JSON.stringify([
    caption.text,
    caption.isFinal,
    caption.sourceLanguage,
    caption.detectedLanguage,
    Object.entries(caption.translations).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

/** Persist receipt before networking; remove it only after a server ack. */
export function createCaptionPersistenceQueue(
  persist: (caption: ClassroomCaptionInput) => Promise<void>,
  onError: (error: unknown) => void,
  delayMs = 300,
  options: { store?: CaptionPersistenceStore; retryMs?: number } = {},
) {
  const pending = new Map<string, ClassroomCaptionInput>();
  const completed = new Map<string, ClassroomCaptionInput>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let disposed = false;
  let active: ClassroomCaptionInput | undefined;
  let failures = 0;

  function schedule(delay: number) {
    if (!disposed && !timer && !running && pending.size) timer = setTimeout(() => void flush(), delay);
  }

  function restore() {
    try {
      for (const caption of options.store?.read() ?? []) {
        if (active?.id === caption.id) continue;
        const current = pending.get(caption.id);
        pending.set(caption.id, current ? mergeCaptionInput(current, caption) : caption);
      }
    } catch (error) { onError(error); }
  }

  async function drain() {
    const failed = new Set<string>();
    while (!disposed) {
      const caption = [...pending.values()].find(value => !failed.has(value.id));
      if (!caption) break;
      pending.delete(caption.id);
      active = caption;
      try {
        await persist(caption);
        options.store?.acknowledge(caption);
        completed.delete(caption.id);
        completed.set(caption.id, caption);
        if (completed.size > 500) completed.delete(completed.keys().next().value!);
      } catch (error) {
        const newer = pending.get(caption.id);
        pending.set(caption.id, newer ? mergeCaptionInput(caption, newer) : caption);
        failed.add(caption.id);
        if (!disposed) onError(error);
      } finally {
        active = undefined;
      }
    }
    failures = failed.size ? failures + 1 : 0;
  }

  function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    if (disposed) return Promise.resolve();
    restore();
    if (!running) {
      running = drain().finally(() => {
        running = undefined;
        schedule(failures ? Math.min(30_000, (options.retryMs ?? 1_000) * 2 ** Math.min(failures - 1, 5)) : delayMs);
      });
    }
    return running;
  }

  restore();
  schedule(delayMs);
  return {
    enqueue(caption: ClassroomCaptionInput) {
      if (disposed) return;
      const previous = pending.get(caption.id) ?? (active?.id === caption.id ? active : completed.get(caption.id));
      const merged = previous ? mergeCaptionInput(previous, caption) : caption;
      const saved = completed.get(caption.id);
      if (saved && captionFingerprint(saved) === captionFingerprint(merged)) return;
      pending.set(caption.id, merged);
      try { options.store?.write(merged); } catch (error) { onError(error); }
      schedule(delayMs);
    },
    flush,
    dispose() {
      disposed = true;
      clearTimeout(timer);
      // Pending durable entries survive unmount, reload and aborted requests.
      completed.clear();
    },
  };
}
