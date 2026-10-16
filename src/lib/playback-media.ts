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
};

/** Own the media lifecycle so retries release old requests, decoders and timers. */
export function connectPlaybackMedia(video: HTMLVideoElement, src: string, isHls: boolean, options: PlaybackMediaOptions): () => void {
  const controller = new AbortController();
  let disposed = false;
  let hls: Hls | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const report = (issue: PlaybackIssue | null) => {
    if (!disposed) options.onIssue(issue);
  };
  const wait = () => {
    // Repeated stalled/waiting events must not postpone the timeout forever.
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      report("timeout");
    }, options.timeoutMs ?? 12_000);
  };
  const healthy = () => {
    clearTimer();
    report(null);
  };
  const stalled = () => { if (!video.paused) wait(); };
  const failed = () => {
    clearTimer();
    report(playbackMediaIssue(video.error?.code));
  };
  const metadata = () => {
    clearTimer();
    if (options.startAt && Number.isFinite(options.startAt)) {
      const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.1) : options.startAt;
      video.currentTime = Math.min(options.startAt, end);
    }
  };
  const events: Array<[string, () => void]> = [
    ["loadstart", wait], ["play", wait], ["waiting", stalled], ["stalled", stalled],
    ["seeking", stalled], ["playing", healthy], ["canplay", healthy],
    ["loadedmetadata", metadata], ["pause", clearTimer], ["ended", clearTimer], ["error", failed],
  ];
  for (const [name, listener] of events) video.addEventListener(name, listener);

  void Promise.resolve().then(async () => {
    if (disposed) return;
    report(null);
    options.onDirectUrl(null);
    wait();
    if (!isHls) {
      // Give the native player the final URL instead of a cross-origin 307.
      const url = await resolvePlaybackSource(src, options.fetcher ?? fetch, controller.signal);
      if (disposed) return;
      options.onDirectUrl(url);
      video.src = url;
      video.load();
      return;
    }
    if (video.canPlayType("application/vnd.apple.mpegurl") || video.canPlayType("application/x-mpegURL")) {
      video.src = src;
      video.load();
      return;
    }
    const { default: HlsPlayer } = await (options.loadHls ?? (() => import("hls.js")))();
    if (disposed) return;
    if (!HlsPlayer.isSupported()) {
      clearTimer();
      report("unsupported");
      return;
    }
    hls = new HlsPlayer();
    hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      clearTimer();
      report(data.type === HlsPlayer.ErrorTypes.NETWORK_ERROR ? "network"
        : data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR ? "decode" : "unsupported");
    });
    hls.loadSource(src);
    hls.attachMedia(video);
  }).catch((error: unknown) => {
    if (disposed) return;
    clearTimer();
    report(error instanceof PlaybackSourceError ? error.issue : "network");
  });

  return () => {
    disposed = true;
    clearTimer();
    controller.abort();
    for (const [name, listener] of events) video.removeEventListener(name, listener);
    hls?.destroy();
    video.pause();
    video.removeAttribute("src");
    video.load();
  };
}
