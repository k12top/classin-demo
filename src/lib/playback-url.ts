export function isMp4PlaybackUrl(value: string | null | undefined): boolean {
  return hasPlaybackExtension(value, ".mp4");
}

export function isHlsPlaybackUrl(value: string | null | undefined): boolean {
  return hasPlaybackExtension(value, ".m3u8");
}

function hasPlaybackExtension(
  value: string | null | undefined,
  extension: ".mp4" | ".m3u8"
): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;

  try {
    const url = trimmed.startsWith("/")
      ? new URL(trimmed, "https://classroom.internal")
      : new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.pathname.toLowerCase().endsWith(extension);
  } catch {
    return false;
  }
}

export function playbackPagePath(courseId: string): string {
  return `/courses/${encodeURIComponent(courseId)}/playback`;
}

export type PlaybackTarget =
  | { kind: "internal"; href: string }
  | { kind: "external"; href: string };

export function getPlaybackTarget(
  courseId: string,
  recordUrl: string | null | undefined
): PlaybackTarget | null {
  const trimmed = recordUrl?.trim();
  if (!trimmed) return null;

  if (isMp4PlaybackUrl(trimmed) || isHlsPlaybackUrl(trimmed)) {
    return { kind: "internal", href: playbackPagePath(courseId) };
  }

  return { kind: "external", href: trimmed };
}
