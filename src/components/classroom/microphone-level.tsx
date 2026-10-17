"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "@/lib/i18n/context";
import type { ClassroomMediaProvider } from "@/lib/classroom/types";

export function MicrophoneLevel({ provider, participantId, enabled }: {
  provider: ClassroomMediaProvider;
  participantId: string;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const meterRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const meter = meterRef.current;
    if (!meter) return;
    let lastSpeechAt = -Infinity;
    const update = () => {
      const level = enabled ? provider.getMicrophoneLevel?.(participantId) ?? 0 : 0;
      const percent = Math.round(Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0)) * 100);
      const now = performance.now();
      if (enabled && percent >= 3) lastSpeechAt = now;
      // Ignore low background noise and bridge brief pauses between syllables.
      const speaking = enabled && now - lastSpeechAt < 300;
      meter.style.setProperty("--microphone-level", String(percent / 100));
      meter.setAttribute("aria-valuenow", String(percent));
      meter.dataset.speaking = String(speaking);
      meter.setAttribute("aria-hidden", String(!speaking));
    };
    update();
    if (!enabled || !provider.getMicrophoneLevel) return;
    // Update only the meter, keeping high-frequency samples out of classroom state.
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [enabled, participantId, provider]);

  return <span ref={meterRef} className="classroom-v3-microphone-level" role="meter"
    aria-label={t("classroom.v3.microphoneLevel")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}
    data-speaking="false" aria-hidden="true">
    <span />
  </span>;
}
