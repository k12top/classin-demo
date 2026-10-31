"use client";

import { useEffect, useRef } from "react";
import { Trophy } from "lucide-react";

/** A small, short-lived WebGL scene; no model downloads or persistent GPU loop. */
export function TrophyModel({ reducedMotion }: { reducedMotion: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fallback = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    const element = canvas.current;
    const onLost = () => {
      element.style.display = "none";
      element.dataset.renderer = "unavailable";
      if (fallback.current) fallback.current.style.display = "block";
    };
    element.addEventListener("webglcontextlost", onLost);
    element.dataset.renderer = "loading";
    // This component mounts only for a newly awarded recipient, never at room
    // entry, for historical counts or for the classmates' lightweight notice.
    void import("./trophy-renderer").then(({ renderTrophy }) => {
      if (cancelled) return;
      try {
        dispose = renderTrophy(element, reducedMotion);
        element.style.display = "block";
        if (fallback.current) fallback.current.style.display = "none";
      } catch { onLost(); }
    }).catch(() => { if (!cancelled) onLost(); });
    return () => { cancelled = true; element.removeEventListener("webglcontextlost", onLost); dispose?.(); };
  }, [reducedMotion]);
  return <><canvas ref={canvas} aria-hidden="true" style={{ display: "none" }} /><Trophy ref={fallback} data-renderer="fallback" style={{ display: "block" }} /></>;
}
