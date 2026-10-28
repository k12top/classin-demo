import type { CaptionPersistenceStore } from "./caption-persistence";
import { mergeCaptionInput } from "./caption-merge";
import type { ClassroomCaptionInput } from "./types";

const PREFIX = "classroom-caption-outbox:v1:";
type OutboxEntry = { ownerId: string; sessionId: string; caption: ClassroomCaptionInput };

function decode(value: string | null): OutboxEntry | null {
  if (!value) return null;
  const entry = JSON.parse(value) as OutboxEntry;
  const caption = entry?.caption;
  if (typeof entry?.ownerId !== "string" || typeof entry.sessionId !== "string" ||
      !caption || typeof caption.id !== "string" || typeof caption.text !== "string" ||
      typeof caption.speakerId !== "string" || typeof caption.isFinal !== "boolean" ||
      !Number.isFinite(Date.parse(caption.occurredAt)) || !caption.translations || typeof caption.translations !== "object") {
    throw new Error("Invalid caption outbox entry");
  }
  return entry;
}

function keys(storage: Storage) {
  return Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => Boolean(key?.startsWith(PREFIX)));
}

export function captionOutboxSessions(storage: Storage, ownerId: string): string[] {
  const sessions = new Set<string>();
  for (const key of keys(storage).filter(key => key.startsWith(`${PREFIX}${encodeURIComponent(ownerId)}:`))) {
    const entry = decode(storage.getItem(key));
    if (entry?.ownerId === ownerId) sessions.add(entry.sessionId);
  }
  return [...sessions];
}

/** One key per sentence avoids whole-lesson overwrites across tabs. Credentials
 * are never stored. An old ack cannot erase a newer in-flight translation. */
export function createCaptionOutbox(storage: Storage, ownerId: string, sessionId: string, writerId = "default"): CaptionPersistenceStore {
  const prefix = `${PREFIX}${encodeURIComponent(ownerId)}:${encodeURIComponent(sessionId)}:`;
  const writerPrefix = prefix + encodeURIComponent(writerId) + ":";
  const owned = new Map<string, { key: string; caption: ClassroomCaptionInput }[]>();
  return {
    read() {
      return keys(storage).filter(key => key.startsWith(prefix)).flatMap(key => {
        const entry = decode(storage.getItem(key));
        return entry?.ownerId === ownerId && entry.sessionId === sessionId ? [entry.caption] : [];
      });
    },
    write(caption) {
      const sentencePrefix = writerPrefix + encodeURIComponent(caption.id) + ":";
      const previous = owned.get(caption.id) ?? keys(storage).filter(key => key.startsWith(sentencePrefix)).flatMap(key => {
        const entry = decode(storage.getItem(key));
        return entry ? [{ key, caption: entry.caption }] : [];
      });
      const base = previous.reduce<ClassroomCaptionInput | undefined>((value, entry) => value ? mergeCaptionInput(value, entry.caption) : entry.caption, undefined);
      const merged = base ? mergeCaptionInput(base, caption) : caption;
      // Immutable version keys make read/ack/remove safe across browser tabs:
      // a translation received between an ack's read and remove has a new key.
      const key = sentencePrefix + crypto.randomUUID();
      storage.setItem(key, JSON.stringify({ ownerId, sessionId, caption: merged }));
      owned.set(caption.id, [{ key, caption: merged }]);
      for (const entry of previous) storage.removeItem(entry.key);
      if (owned.size > 500) owned.delete(owned.keys().next().value!);
    },
    acknowledge(caption) {
      for (const key of keys(storage).filter(key => key.startsWith(prefix))) {
        const current = decode(storage.getItem(key));
        if (current?.caption.id === caption.id && captionContains(caption, current.caption)) storage.removeItem(key);
      }
      if (owned.get(caption.id)?.every(entry => captionContains(caption, entry.caption))) owned.delete(caption.id);
    },
  };
}

/** A superseded partial needs no separate row; every late translation still
 * needs to be included in the acknowledged version before its entry is removed. */
export function captionContains(saved: ClassroomCaptionInput, pending: ClassroomCaptionInput) {
  if (pending.isFinal && !saved.isFinal) return false;
  if (pending.text && saved.text !== pending.text) return saved.isFinal && !pending.isFinal;
  return Object.entries(pending.translations).every(([language, text]) => saved.translations[language] === text);
}
