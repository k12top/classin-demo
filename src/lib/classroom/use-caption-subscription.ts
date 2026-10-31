"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useClassroomSyncTask } from "./use-classroom-sync";
import type { CaptionDisplayMode } from "./caption-preferences";

/** Keep per-tab demand alive after reconnection without refreshing presence. */
export function useCaptionSubscription(input: {
  active: boolean; sessionId: string; clientId: string; shareAccess?: string | null;
  language: string; mode: CaptionDisplayMode; sourceLanguage: string; provider: string;
}) {
  const { active, sessionId, clientId, shareAccess, language, mode, sourceLanguage, provider } = input;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);
  const lastIntent = useRef<{ language: string; mode: CaptionDisplayMode } | null>(null);
  const interactiveError = useRef(false);
  useEffect(() => { generation.current += 1; return () => { generation.current += 1; }; }, [active, sessionId]);

  const save = useCallback((nextLanguage: string, nextMode: CaptionDisplayMode, interactive = true) => {
    if (!active) return Promise.resolve(false);
    const currentGeneration = generation.current;
    if (interactive) { setBusy(true); lastIntent.current = { language: nextLanguage, mode: nextMode }; }
    const request = chain.current.catch(() => undefined).then(async () => {
      if (currentGeneration !== generation.current) return false;
      try {
        const translated = nextMode === "bilingual" || nextMode === "translated";
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/classroom/caption-preference`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, language: translated && nextLanguage !== sourceLanguage ? nextLanguage : null, ...(shareAccess && { shareAccess }) }),
          signal: AbortSignal.timeout(8_000),
        });
        const payload = await response.json() as { code?: string };
        if (currentGeneration !== generation.current) return false;
        if (!response.ok) {
          if (interactive) interactiveError.current = true;
          if (interactive || !interactiveError.current) setError(payload.code || "caption_preference_failed");
          return false;
        }
        if (interactive) interactiveError.current = false;
        if (!interactiveError.current) setError(null);
        return true;
      } catch {
        if (currentGeneration === generation.current) {
          if (interactive) interactiveError.current = true;
          if (interactive || !interactiveError.current) setError("caption_preference_failed");
        }
        return false;
      } finally {
        if (interactive && currentGeneration === generation.current) setBusy(false);
      }
    });
    chain.current = request;
    return request;
  }, [active, clientId, sessionId, shareAccess, sourceLanguage]);

  // captionLanguage is persisted on the connection; the one presence heartbeat
  // keeps its lease alive. Re-save on configuration changes and reconnection.
  useClassroomSyncTask({sessionId,taskKey:`caption-preference:${clientId}:${language}:${mode}:${provider}:${sourceLanguage}`,
    topics:["resume","caption-preference"],active,realtimeMs:null,fallbackMs:null,background:true,
    run:async()=>{if(!await save(language,mode,false))throw new Error("caption_preference_failed");}});
  return { save, busy, error, lastIntent };
}
