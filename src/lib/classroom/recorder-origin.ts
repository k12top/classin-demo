/** The web recorder must load the same deployment that started it. */
export function recorderPageOrigin(env: NodeJS.ProcessEnv): string | null {
  if (env.VERCEL_ENV === "preview" && env.VERCEL_URL?.trim()) {
    return `https://${env.VERCEL_URL.trim().replace(/^https?:\/\//, "")}`;
  }
  return env.CLASSROOM_PUBLIC_BASE_URL?.trim() || null;
}
