"use client";

import { useLayoutEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { motion, useDragControls } from "motion/react";
import { captionTranslation, type CaptionDisplayMode } from "@/lib/classroom/caption-display";
import type { ClassroomCaptionSnapshot } from "@/lib/classroom/types";
import { useTranslation } from "@/lib/i18n/context";

export function LiveCaptionOverlay({ captions, language, mode, background, color }: {
  captions: readonly ClassroomCaptionSnapshot[];
  language: string;
  mode: CaptionDisplayMode;
  background: "transparent" | "text" | "solid";
  color: string;
}) {
  const { t } = useTranslation();
  const boundsRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const multipleSpeakers = new Set(captions.map(caption => caption.speakerId)).size > 1;
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const bounds = boundsRef.current;
    if (!overlay || !bounds) return;
    const fitCompletePairs = () => {
      const rows = Array.from(overlay.children) as HTMLElement[];
      rows.forEach(row => { row.hidden = false; });
      const style = getComputedStyle(overlay);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const gap = parseFloat(style.rowGap) || 0;
      // Keep each original/translation pair whole. Older pairs move to history
      // when the stage cannot fit them, rather than leaving an orphaned line.
      const newestHeight = rows.at(-1)?.offsetHeight ?? 0;
      overlay.style.maxHeight = `${Math.min(bounds.clientHeight, Math.max(Math.min(320, bounds.clientHeight * .8), newestHeight + padding))}px`;
      const available = overlay.clientHeight - padding;
      let used = 0;
      let outOfSpace = false;
      for (const row of rows.reverse()) {
        const height = row.offsetHeight + (used ? gap : 0);
        row.hidden = outOfSpace || (used > 0 && used + height > available);
        if (row.hidden) outOfSpace = true;
        if (!row.hidden) used += height;
      }
      overlay.scrollTop = 0;
    };
    fitCompletePairs();
    const observer = new ResizeObserver(fitCompletePairs);
    observer.observe(bounds);
    return () => observer.disconnect();
  }, [captions, language, mode]);

  return <div className="classroom-v3-caption-bounds" ref={boundsRef}>
    <motion.div ref={overlayRef} className="classroom-v3-caption-overlay" data-background={background}
      style={{ "--caption-overlay-background": color } as CSSProperties}
      drag dragControls={dragControls} dragListener={false} dragConstraints={boundsRef} dragMomentum={false} dragElastic={0}
      aria-live="polite" aria-relevant="additions text">
      {captions.map(caption => {
        const translation = captionTranslation(caption, language);
        const waitingForTranslation = mode === "bilingual" && !translation &&
          language.split("-")[0] !== (caption.detectedLanguage || caption.sourceLanguage).split("-")[0];
        const textProps = {
          className: "classroom-v3-caption-text",
          title: t("classroom.v3.captionDragHint"),
          onPointerDown: (event: PointerEvent<HTMLSpanElement>) => dragControls.start(event),
        };
        return <div key={caption.id} className="classroom-v3-caption-speaker" data-caption-id={caption.id}>
          {multipleSpeakers && <strong className="classroom-v3-caption-speaker-name"><span {...textProps}>{caption.speakerName}</span></strong>}
          {mode !== "translated" && <p><span {...textProps}>{caption.text}</span></p>}
          {mode !== "original" && translation && <p className="is-translation"><span {...textProps}>{translation}</span></p>}
          {waitingForTranslation && <p className="is-placeholder"><span {...textProps}>{t("classroom.v3.captionTranslationPending")}</span></p>}
        </div>;
      })}
    </motion.div>
  </div>;
}
