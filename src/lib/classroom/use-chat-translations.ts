"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClassroomMessageSnapshot } from "./types";
type Translation = { status: "completed" | "pending" | "failed"; text?: string };
export function useChatTranslations(sessionId: string, messages: ClassroomMessageSnapshot[], language: string, enabled: boolean, shareAccess?: string | null, viewerId?: string) {
  const [values, setValues] = useState<Record<string, Translation>>({});
  const [unavailableScope, setUnavailableScope] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const scope = JSON.stringify([sessionId, shareAccess || "", viewerId || ""]);
  const unavailable = unavailableScope === scope;
  const key = messages.filter(message => message.kind === "text" && !message.deletedAt && !message.id.startsWith("optimistic:")).map(message => message.id).join("|");
  useEffect(() => {
    if (!enabled || unavailable || !sessionId || !key) return;
    const ids = key.split("|").filter(id => !values[JSON.stringify([scope, language, id])]).slice(-20);
    if (!ids.length) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      let batch: Record<string, Translation> = {};
      try {
        // Pending claims owned by another viewer get a few bounded reads, not new AI requests.
        for (let attempt = 0; attempt < 3; attempt++) {
          const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/classroom/messages/translate`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]), body: JSON.stringify({ messageIds: ids, language, ...(shareAccess && { shareAccess }) }) });
          const result = await response.json();
          controller.signal.throwIfAborted();
          if (!response.ok) { if (result.code === "translation_unavailable") setUnavailableScope(scope); throw new Error("translation_failed"); }
          batch = result.translations || {};
          if (!Object.values(batch).some(value => value.status === "pending")) break;
          await new Promise(resolve => setTimeout(resolve, 1500));
          controller.signal.throwIfAborted();
        }
        // Exhausted pending claims must expose retry, rather than a spinner that never polls again.
        if (!controller.signal.aborted) { setUnavailableScope(null); setValues(previous => ({ ...previous, ...Object.fromEntries(ids.map(id => [JSON.stringify([scope, language, id]), batch[id]?.status === "completed" && typeof batch[id].text === "string" && batch[id].text.trim() ? batch[id] : { status: "failed" }])) })); }
      } catch {
        if (!controller.signal.aborted) setValues(previous => ({ ...previous, ...Object.fromEntries(ids.map(id => [JSON.stringify([scope, language, id]), { status: "failed" as const }])) }));
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [sessionId, key, language, enabled, shareAccess, scope, values, retry, unavailable]);
  const translations = useMemo(() => Object.fromEntries(messages.map(message => [message.id, values[JSON.stringify([scope, language, message.id])]])), [messages, values, scope, language]);
  const retryTranslations = useCallback(() => { setUnavailableScope(null); setValues(previous => Object.fromEntries(Object.entries(previous).filter(([, value]) => value.status === "completed"))); setRetry(value => value + 1); }, []);
  useEffect(() => {
    if (!enabled || unavailable || typeof window === "undefined") return;
    const recover = () => {
      setValues(previous => {
        let next=previous;
        for (const [entry,value] of Object.entries(previous)) if (value.status === "failed" && JSON.parse(entry)[0] === scope) {
          if (next === previous) next={...previous};
          delete next[entry];
        }
        return next;
      });
    };
    window.addEventListener("online", recover);
    return () => window.removeEventListener("online", recover);
  }, [enabled, scope, unavailable]);
  return { translations, unavailable, retry: retryTranslations };
}
