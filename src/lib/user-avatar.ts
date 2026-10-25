/** Shared name avatars: up to three Han characters or Latin initials. */
export function avatarInitials(value?: string | null): string {
  const name = value?.trim();
  if (!name) return "?";
  const parts = [...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(name)]
    .map((part) => part.segment).filter((part) => /[\p{L}\p{N}]/u.test(part));
  if (/\p{Script=Han}/u.test(name)) return parts.slice(0, 3).join("");
  const words = name.split(/[\s._-]+/u).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 3).map((word) => Array.from(word)[0]).join("") : parts.slice(0, 2).join("")).toLocaleUpperCase("en");
}

/** Ignore the identity provider's shared stock image, while preserving personal uploads. */
export function userAvatarSource(source?: string): string | undefined {
  if (!source) return undefined;
  try {
    const url = new URL(source);
    if (["cdn.casbin.org", "cdn.casdoor.com"].includes(url.hostname) &&
      ["/avatar.svg", "/img/casbin.svg"].includes(url.pathname)) return undefined;
  } catch { /* Local, trusted avatar assets are supported. */ }
  return source;
}

export const AVATAR_PRESETS = ["book", "sun", "leaf", "waves", "star", "mountain"] as const;
export type AvatarPreset = typeof AVATAR_PRESETS[number] | "initials";
export function presetAvatarSource(value: unknown): string | null {
  if (value === "initials") return "";
  return typeof value === "string" && AVATAR_PRESETS.includes(value as typeof AVATAR_PRESETS[number])
    ? `/avatars/preset-${value}.svg` : null;
}
