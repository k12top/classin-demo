import type { ClassroomCaptionInput } from "./types";

function fingerprint(caption: ClassroomCaptionInput) {
  return JSON.stringify([
    caption.text,
    caption.sourceLanguage,
    caption.detectedLanguage,
    Object.entries(caption.translations).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

/** Render every partial locally; persist merged finals with one request at a time. */
export function createCaptionPersistenceQueue(
  persist: (caption: ClassroomCaptionInput) => Promise<void>,
  onError: (error: unknown) => void,
  delayMs = 300,
) {
  const pending = new Map<string, ClassroomCaptionInput>();
  const completed = new Map<string, ClassroomCaptionInput>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let disposed = false;
  let active: ClassroomCaptionInput | undefined;

  async function drain() {
    while (!disposed && pending.size) {
      const caption = pending.values().next().value!;
      pending.delete(caption.id);
      const key = fingerprint(caption);
      const saved = completed.get(caption.id);
      if (saved && fingerprint(saved) === key) continue;
      active = caption;
      try {
        await persist(caption);
        completed.delete(caption.id);
        completed.set(caption.id, caption);
        if (completed.size > 500) completed.delete(completed.keys().next().value!);
      } catch (error) {
        if (!disposed) onError(error);
      } finally {
        active = undefined;
      }
    }
  }

  function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    if (disposed) return Promise.resolve();
    if (!running) {
      running = drain().finally(() => { running = undefined; });
    }
    return running;
  }

  return {
    enqueue(caption: ClassroomCaptionInput) {
      if (disposed || !caption.isFinal) return;
      const previous = pending.get(caption.id) ?? (active?.id === caption.id ? active : completed.get(caption.id));
      const merged = previous ? {
        ...previous,
        ...caption,
        text: caption.text || previous.text,
        translations: { ...previous.translations, ...caption.translations },
      } : caption;
      const saved = completed.get(caption.id);
      if (saved && fingerprint(saved) === fingerprint(merged)) return;
      pending.set(caption.id, merged);
      if (!timer && !running) timer = setTimeout(() => void flush(), delayMs);
    },
    flush,
    dispose() {
      disposed = true;
      clearTimeout(timer);
      pending.clear();
      completed.clear();
    },
  };
}
