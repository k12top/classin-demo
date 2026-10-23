export const CAPTION_APPEARANCE_KEY = "classroom_caption_appearance_v1";
export const defaultCaptionAppearance = { width: 60, height: 180, fontSize: 18, opacity: 75, textColor: "#ffffff" };
export type CaptionAppearance = typeof defaultCaptionAppearance;
export function parseCaptionAppearance(raw: string | null): CaptionAppearance {
  let value: Partial<CaptionAppearance> = {};
  try { const parsed: unknown = JSON.parse(raw || "{}"); if (parsed && typeof parsed === "object") value = parsed; } catch { /* Defaults keep corrupt storage usable. */ }
  const number = (key: "width" | "height" | "fontSize" | "opacity", min: number, max: number) => typeof value[key] === "number" && Number.isFinite(value[key]) ? Math.max(min, Math.min(max, value[key]!)) : defaultCaptionAppearance[key];
  return { width: number("width", 25, 95), height: number("height", 80, 400), fontSize: number("fontSize", 12, 32), opacity: number("opacity", 0, 100), textColor: typeof value.textColor === "string" && /^#[\da-f]{6}$/i.test(value.textColor) ? value.textColor : defaultCaptionAppearance.textColor };
}
