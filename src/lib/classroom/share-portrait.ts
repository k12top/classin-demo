import type { ClassroomScreenShareOptions } from "./types";

export function screenShareProfile(mode: ClassroomScreenShareOptions["mode"]) {
  return mode === "portrait"
    ? { width: 1920, height: 1080, frameRate: 15, bitrateMin: 1400, bitrateMax: 2600 }
    : { width: 1280, height: 720, frameRate: 15, bitrateMin: 800, bitrateMax: 1600 };
}

export function supportsSharePortrait(): boolean {
  return typeof navigator !== "undefined" && /Chrome|Chromium|Edg\//.test(navigator.userAgent)
    && !/Android|Mobile|iPhone|iPad/.test(navigator.userAgent)
    && typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
}

/** Owns only the output and render resources. Input tracks belong to the provider. */
export async function createSharePortrait(
  screen: MediaStreamTrack,
  camera: () => MediaStreamTrack | null,
  initial: ClassroomScreenShareOptions,
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context || !canvas.captureStream) throw new Error("当前浏览器不支持共享＋人像，请使用桌面 Chrome 或 Edge");
  const source = document.createElement("video"), presenter = document.createElement("video");
  for (const video of [source, presenter]) { video.muted = true; video.autoplay = true; video.playsInline = true; }
  let options = initial, disposed = false, cameraInput: MediaStreamTrack | null = null;
  let worker: Worker | null = null, timer: ReturnType<typeof setInterval> | undefined, output: MediaStream | undefined;
  const resize = () => { const profile = screenShareProfile(options.mode); canvas.width = profile.width; canvas.height = profile.height; };
  resize();
  function paint() {
    if (disposed || !context) return;
    context.fillStyle = "#111318"; context.fillRect(0, 0, canvas.width, canvas.height);
    if (source.readyState >= 2 && source.videoWidth && source.videoHeight) {
      const scale = Math.min(canvas.width / source.videoWidth, canvas.height / source.videoHeight);
      const width = source.videoWidth * scale, height = source.videoHeight * scale;
      context.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }
    const next = options.mode === "portrait" ? camera() : null;
    if (next !== cameraInput) {
      cameraInput = next; presenter.srcObject = next ? new MediaStream([next]) : null;
      if (next) void presenter.play().catch(() => undefined);
    }
    if (next?.enabled && !next.muted && next.readyState === "live" && presenter.readyState >= 2 && presenter.videoWidth && presenter.videoHeight) {
      const width = 320, height = 240, margin = 40, corner = options.corner ?? "br";
      const x = corner.endsWith("l") ? margin : canvas.width - width - margin;
      const y = corner.startsWith("t") ? margin : canvas.height - height - margin;
      const scale = Math.max(width / presenter.videoWidth, height / presenter.videoHeight);
      context.save(); context.beginPath(); context.roundRect(x, y, width, height, 14); context.clip();
      context.drawImage(presenter, x + (width - presenter.videoWidth * scale) / 2, y + (height - presenter.videoHeight * scale) / 2, presenter.videoWidth * scale, presenter.videoHeight * scale);
      context.restore();
    }
  }
  function dispose() {
    if (disposed) return; disposed = true; worker?.terminate(); if (timer) clearInterval(timer);
    for (const track of output?.getTracks() ?? []) track.stop();
    for (const video of [source, presenter]) { video.pause(); video.srcObject = null; }
    canvas.width = canvas.height = 0;
  }
  try {
    source.srcObject = new MediaStream([screen]);
    await source.play();
    if (screen.readyState === "ended") throw new DOMException("Screen sharing ended", "AbortError");
    paint(); output = canvas.captureStream(15);
    // rAF stops when a teacher shares another tab; a worker clock keeps the
    // rendering loop independent of document animation visibility.
    try {
      const url = URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),1000/15)"], { type: "text/javascript" }));
      try { worker = new Worker(url); worker.onmessage = paint; } finally { URL.revokeObjectURL(url); }
    } catch { timer = setInterval(paint, 1000 / 15); }
    return { track: output.getVideoTracks()[0], paint, setOptions(next: ClassroomScreenShareOptions) { options = next; resize(); paint(); }, dispose };
  } catch (error) { dispose(); throw error; }
}
