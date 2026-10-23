"use client";
import { useEffect, useState } from "react";
import type { ClassroomMessageSnapshot } from "./types";
type Translation = { status: "completed" | "pending" | "failed"; text?: string };
export function useChatTranslations(sessionId: string, messages: ClassroomMessageSnapshot[], language: string, enabled: boolean, shareAccess?: string | null) {
  const [values, setValues] = useState<Record<string, Translation>>({});
  const [unavailable, setUnavailable] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = messages.filter(message => !message.deletedAt && !message.id.startsWith("optimistic:")).map(message => message.id).join("|");
  useEffect(() => {
    if (!enabled || unavailable || !sessionId || !key) return;
    const ids = key.split("|").filter(id => !values[`${language}:${id}`]).slice(-20);
    if (!ids.length) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let batch: Record<string, Translation> = {};
      try {
        // Pending claims owned by another viewer get a few bounded reads, not new AI requests.
        for (let attempt = 0; attempt < 3; attempt++) {
          const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/classroom/messages/translate`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]), body: JSON.stringify({ messageIds: ids, language, ...(shareAccess && { shareAccess }) }) });
          const result = await response.json();
          if (!response.ok) { if (result.code === "translation_unavailable") setUnavailable(true); throw new Error("translation_failed"); }
          batch = result.translations || {};
          if (!Object.values(batch).some(value => value.status === "pending")) break;
          await new Promise(resolve => setTimeout(resolve, 1500));
          controller.signal.throwIfAborted();
        }
        if (!controller.signal.aborted) { setUnavailable(false); setValues(previous => ({ ...previous, ...Object.fromEntries(ids.map(id => [`${language}:${id}`, batch[id] || { status: "failed" }])) })); }
      } catch {
        if (!controller.signal.aborted) setValues(previous => ({ ...previous, ...Object.fromEntries(ids.map(id => [`${language}:${id}`, { status: "failed" as const }])) }));
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [sessionId, key, language, enabled, shareAccess, values, retry, unavailable]);
  return { translations: Object.fromEntries(messages.map(message => [message.id, values[`${language}:${message.id}`]])), unavailable,
    retry: () => { setUnavailable(false); setValues(previous => Object.fromEntries(Object.entries(previous).filter(([, value]) => value.status === "completed"))); setRetry(value => value + 1); } };
}
