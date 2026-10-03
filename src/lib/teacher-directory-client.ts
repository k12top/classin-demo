export type TeacherDirectoryEntry = {
  id: string;
  casdoorUuid?: string | null;
  name: string;
  displayName: string;
  email: string;
  avatar?: string;
  role?: string;
};

const CACHE_KEY = "classroom_teacher_directory_v1";
const CACHE_TTL_MS = 10 * 60_000;

type CachedDirectory = {
  expiresAt: number;
  teachers: TeacherDirectoryEntry[];
};

let memoryCache: CachedDirectory | null = null;
let activeRequest: Promise<TeacherDirectoryEntry[]> | null = null;

function readSessionCache(): CachedDirectory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedDirectory;
    if (!Array.isArray(parsed.teachers) || parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(teachers: TeacherDirectoryEntry[]) {
  const cached = { teachers, expiresAt: Date.now() + CACHE_TTL_MS };
  memoryCache = cached;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch {
      // sessionStorage can be unavailable in private browsing; memory cache remains valid.
    }
  }
}

export async function getTeacherDirectory(
  options: { force?: boolean } = {},
): Promise<TeacherDirectoryEntry[]> {
  if (!options.force) {
    if (memoryCache && memoryCache.expiresAt > Date.now()) {
      return memoryCache.teachers;
    }
    const sessionCache = readSessionCache();
    if (sessionCache) {
      memoryCache = sessionCache;
      return sessionCache.teachers;
    }
    if (activeRequest) return activeRequest;
  }

  activeRequest = (async () => {
    const response = await fetch("/api/users/teachers?limit=100", {
      credentials: "same-origin",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.hint || data.error || "Failed to load teachers");
    }
    const teachers = (data.teachers ?? data.users ?? []) as TeacherDirectoryEntry[];
    writeCache(teachers);
    return teachers;
  })();

  try {
    return await activeRequest;
  } finally {
    activeRequest = null;
  }
}
