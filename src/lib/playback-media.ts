import type Hls from "hls.js";

export type PlaybackIssue = "network" | "decode" | "unsupported" | "timeout" | "unauthorized" | "forbidden" | "unavailable";

/** Only our authenticated recording endpoints can resolve a private media URL. */
export function recordingSourceRequest(src: string): string | null {
  if (!/^\/api\/(?:sessions\/[^/?#]+\/recordings\/[^/?#]+\/play|courses\/[^/?#]+\/recording\.mp4)(?:\?|$)/.test(src)) return null;
  const url = new URL(src, "https://classroom.internal");
  url.searchParams.set("delivery", "url");
  return `${url.pathname}${url.search}`;
}

export function playbackMediaIssue(code: number | undefined): PlaybackIssue | null {
  if (code === 1) return null; // A user-initiated abort is not a playback failure.
  if (code === 3) return "decode";
  if (code === 4) return "unsupported";
  return "network";
}

class PlaybackSourceError extends Error {
  constructor(readonly issue: PlaybackIssue) {
    super(issue);
  }
}

export async function resolvePlaybackSource(src: string, fetcher: typeof fetch, signal: AbortSignal): Promise<string> {
  const request = recordingSourceRequest(src);
  if (!request) return src;
  const response = await fetcher(request, {
    credentials: "same-origin", cache: "no-store", signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new PlaybackSourceError(response.status === 401 ? "unauthorized"
      : response.status === 403 ? "forbidden" : response.status === 404 ? "unavailable" : "network");
  }
  const payload = await response.json() as { url?: unknown; format?: unknown };
  if (typeof payload.url !== "string" || payload.format !== "mp4") throw new PlaybackSourceError("unavailable");
  const url = new URL(payload.url);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new PlaybackSourceError("unavailable");
  return url.href;
}

type PlaybackMediaOptions = {
  onIssue: (issue: PlaybackIssue | null) => void;
  onDirectUrl: (url: string | null) => void;
  fetcher?: typeof fetch;
  loadHls?: () => Promise<{ default: typeof Hls }>;
  timeoutMs?: number;
  startAt?: number;
  hlsSrc?: string | null;
  userAgent?: string;
  onFormat?: (format: "hls" | "mp4") => void;
  resume?: boolean;
};

/** Explicit HarmonyOS signatures use the known-compatible MP4 route. Capability/error fallback covers hidden UAs. */
export function prefersMp4Playback(userAgent: string): boolean {
  return /HarmonyOS|OpenHarmony/i.test(userAgent);
}

/** Own both formats as one media lifecycle; a failed HLS attempt falls back only once. */
export function connectPlaybackMedia(video: HTMLVideoElement, src: string, isHls: boolean, options: PlaybackMediaOptions): () => void {
  const controller = new AbortController();
  let disposed = false, changingSource = false, fallbackAttempted = false;
  let generation = 0;
  let format: "mp4" | "hls" = "mp4";
  let position = options.startAt || 0;
  let wantsPlayback = Boolean(options.resume), resume = Boolean(options.resume);
  let hls: Hls | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };
  const report = (issue: PlaybackIssue | null) => { if (!disposed) options.onIssue(issue); };
  const fallback = () => {
    if (disposed || format !== "hls" || isHls || !options.hlsSrc || fallbackAttempted) return false;
    fallbackAttempted = true;
    if (Number.isFinite(video.currentTime) && video.currentTime > 0) position = video.currentTime;
    resume = wantsPlayback || !video.paused;
    void attach("mp4", src);
    return true;
  };
  const issue = (value: PlaybackIssue) => { if (!fallback()) report(value); };
  const wait = () => {
    // Repeated stalled/waiting events must not postpone recovery forever.
    if (changingSource || timer !== undefined) return;
    timer = setTimeout(() => { timer = undefined; issue("timeout"); }, options.timeoutMs ?? 12_000);
  };
  const healthy = () => { clearTimer(); report(null); };
  const stalled = () => { if (!video.paused || wantsPlayback) wait(); };
  const failed = () => {
    if (changingSource || !video.error) return;
    const value = playbackMediaIssue(video.error.code);
    if (value) { clearTimer(); issue(value); }
  };
  const metadata = () => {
    clearTimer();
    if (position && Number.isFinite(position)) {
      const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.1) : position;
      video.currentTime = Math.min(position, end);
    }
    if (resume) { resume = false; void video.play().catch(() => {}); }
  };
  const play = () => { if (!changingSource) { wantsPlayback = true; wait(); } };
  const pause = () => { if (!changingSource) { wantsPlayback = false; clearTimer(); } };
  const events: Array<[string, () => void]> = [
    ["loadstart", wait], ["play", play], ["waiting", stalled], ["stalled", stalled],
    ["seeking", stalled], ["playing", healthy], ["canplay", healthy],
    ["loadedmetadata", metadata], ["pause", pause], ["ended", clearTimer], ["error", failed],
  ];
  for (const [name, listener] of events) video.addEventListener(name, listener);

  async function attach(nextFormat: "mp4" | "hls", source: string) {
    const epoch = ++generation;
    format = nextFormat;
    clearTimer();
    changingSource = true;
    hls?.destroy(); hls = null;
    video.pause(); video.removeAttribute("src"); video.load();
    changingSource = false;
    if (disposed) return;
    options.onFormat?.(format);
    report(null); options.onDirectUrl(null); wait();
    try {
      if (format === "mp4") {
        const url = await resolvePlaybackSource(source, options.fetcher ?? fetch, controller.signal);
        if (disposed || epoch !== generation) return;
        options.onDirectUrl(url); video.src = url; video.load();
        return;
      }
      if (video.canPlayType("application/vnd.apple.mpegurl") || video.canPlayType("application/x-mpegURL")) {
        video.src = source; video.load(); return;
      }
      const { default: HlsPlayer } = await (options.loadHls ?? (() => import("hls.js")))();
      if (disposed || epoch !== generation) return;
      if (!HlsPlayer.isSupported()) { clearTimer(); issue("unsupported"); return; }
      const player = new HlsPlayer({ backBufferLength: 30, maxBufferLength: 20, maxMaxBufferLength: 60 });
      hls = player;
      player.on(HlsPlayer.Events.ERROR, (_event, data) => {
        if (disposed || epoch !== generation || !data.fatal) return;
        clearTimer();
        issue(data.type === HlsPlayer.ErrorTypes.NETWORK_ERROR ? "network"
          : data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR ? "decode" : "unsupported");
      });
      player.loadSource(source);
      if (!disposed && epoch === generation) player.attachMedia(video);
    } catch (error: unknown) {
      if (disposed || epoch !== generation) return;
      clearTimer(); issue(error instanceof PlaybackSourceError ? error.issue : "network");
    }
  }
  void Promise.resolve().then(() => {
    if (disposed) return;
    const ua = options.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
    const preferredHls = !isHls && options.hlsSrc && !prefersMp4Playback(ua);
    return attach(isHls || preferredHls ? "hls" : "mp4", preferredHls ? options.hlsSrc! : src);
  });
  return () => {
    disposed = true; generation++; clearTimer(); controller.abort();
    for (const [name, listener] of events) video.removeEventListener(name, listener);
    hls?.destroy(); video.pause(); video.removeAttribute("src"); video.load();
  };
}
