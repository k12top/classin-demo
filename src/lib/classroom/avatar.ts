/** Google profile images are fetched through the classroom's cached origin. */
export function googleClassroomAvatarUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port ||
      !/^lh[3-6]\.googleusercontent\.com$/.test(url.hostname) ||
      !/^\/a(?:\/|-\/)/.test(url.pathname)) return null;
    url.protocol = "https:";
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

export function classroomAvatarSource(value: string) {
  const source = value.trim();
  const google = googleClassroomAvatarUrl(source);
  return google ? `/api/classroom/avatar?url=${encodeURIComponent(google)}` : source;
}
