"use client";
import { useSyncExternalStore } from "react";
import { CAPTION_APPEARANCE_KEY, parseCaptionAppearance, type CaptionAppearance } from "@/lib/classroom/caption-appearance";
import { useTranslation } from "@/lib/i18n/context";
const event = "classroom-caption-appearance";
let transient = "{}";
function snapshot() { try { return localStorage.getItem(CAPTION_APPEARANCE_KEY) || transient; } catch { return transient; } }
function subscribe(callback: () => void) { window.addEventListener(event, callback); window.addEventListener("storage", callback); return () => { window.removeEventListener(event, callback); window.removeEventListener("storage", callback); }; }
export function useCaptionAppearance() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "{}");
  const appearance = parseCaptionAppearance(raw);
  return { appearance, setAppearance: (update: Partial<CaptionAppearance>) => {
    transient = JSON.stringify(parseCaptionAppearance(JSON.stringify({ ...parseCaptionAppearance(snapshot()), ...update })));
    try { localStorage.setItem(CAPTION_APPEARANCE_KEY, transient); } catch { /* This tab still keeps its preference. */ }
    window.dispatchEvent(new Event(event));
  } };
}
export function CaptionAppearanceControls({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const { appearance, setAppearance } = useCaptionAppearance();
  const Container = embedded ? "div" : "fieldset";
  return <Container className="classroom-caption-appearance">{!embedded && <><legend>{t("captionAppearance.title")}</legend><p>{t("captionAppearance.localOnly")}</p></>}
    {([['width',25,95,'%'],['height',80,400,'px'],['fontSize',12,32,'px'],['opacity',0,100,'%']] as const).map(([key,min,max,unit]) => <label key={key}><span>{t(`captionAppearance.${key}`)} <output>{appearance[key]}{unit}</output></span><input type="range" min={min} max={max} value={appearance[key]} onChange={e => setAppearance({ [key]: Number(e.target.value) })} /></label>)}
    <label><span>{t("captionAppearance.textColor")}</span><input type="color" value={appearance.textColor} onChange={e => setAppearance({ textColor: e.target.value })} /></label>
  </Container>;
}
