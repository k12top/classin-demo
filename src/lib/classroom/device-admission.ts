export type ClassroomDeviceEntryMode = "together" | "replace";

/** Random browser identity, scoped to this application; no hardware fingerprint. */
export function classroomDeviceId(): string {
  try {
    const key = "classroom_device_id";
    const saved = localStorage.getItem(key);
    if (saved && /^[a-zA-Z0-9-]{8,64}$/.test(saved)) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch { return crypto.randomUUID(); }
}

export function classroomDeviceLabel(userAgent: string): string {
  const platform = /iPad/i.test(userAgent) ? "iPad" : /iPhone/i.test(userAgent) ? "iPhone"
    : /Android/i.test(userAgent) ? "Android" : /Macintosh|Mac OS X/i.test(userAgent) ? "Mac"
    : /Windows/i.test(userAgent) ? "Windows" : "Browser";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "";
  return [platform, browser].filter(Boolean).join(" · ");
}
