/** Quality is Agora's last-mile estimate (0 unknown, 1 best, 6 disconnected),
 * not the device's Wi-Fi or cellular signal strength. */
export type NetworkVideoMode = "normal" | "low" | "minimal";
/** Optional 540p screen stream lets weak receivers save bandwidth without
 * lowering the main share. */
export const classroomScreenLowStream = { width: 960, height: 540, framerate: 8, bitrate: 650 } as const;
const rank = { normal: 0, low: 1, minimal: 2 } as const;

export function worseVideoMode(a: NetworkVideoMode, b: NetworkVideoMode): NetworkVideoMode {
  return rank[a] >= rank[b] ? a : b;
}

export function createNetworkDirectionPolicy() {
  let mode: NetworkVideoMode = "normal";
  let candidate: NetworkVideoMode | null = null;
  let since = 0;
  let lastSample: number | null = null;
  return {
    sample(quality: number, now: number): NetworkVideoMode {
      // Silence/unknown quality is never evidence of recovery. A gap also
      // breaks continuity, including when a background tab resumes.
      if (lastSample !== null && (now - lastSample > 6_000 || now < lastSample)) candidate = null;
      lastSample = now;
      if (!Number.isInteger(quality) || quality < 1 || quality > 6) {
        candidate = null;
        return mode;
      }
      const desired = quality <= 2 ? "normal" : quality >= 5 ? "minimal" : "low";
      // Bad quality must first pass through low video before pausing receipt.
      const next = mode === "normal" && desired === "minimal" ? "low" : desired;
      // Moderate quality must not release an existing audio-priority fallback.
      if (next === mode || (mode === "minimal" && next === "low")) {
        candidate = null;
        return mode;
      }
      if (candidate !== next) { candidate = next; since = now; }
      const wait = next === "normal" ? 20_000 : next === "minimal" ? 6_000 : 4_000;
      if (now - since >= wait) { mode = next; candidate = null; }
      return mode;
    },
  };
}

/** Keep the existing capture and microphone alive; only constrain video. */
export function networkVideoEncoder(mode: NetworkVideoMode, screen: boolean) {
  if (mode === "normal") return null;
  if (screen) return mode === "low"
    ? { width: 1920, height: 1080, frameRate: 5, bitrateMin: 200, bitrateMax: 1100 }
    : { width: 1920, height: 1080, frameRate: 3, bitrateMin: 100, bitrateMax: 650 };
  return mode === "low"
    ? { width: 640, height: 360, frameRate: 10, bitrateMin: 60, bitrateMax: 300 }
    : { width: 320, height: 180, frameRate: 8, bitrateMin: 30, bitrateMax: 120 };
}

export function networkSignalLevel(quality: number): 0 | 1 | 2 | 3 | 4 | null {
  return quality >= 1 && quality <= 6
    ? quality <= 2 ? 4 : quality === 3 ? 3 : quality === 4 ? 2 : quality === 5 ? 1 : 0
    : null;
}
