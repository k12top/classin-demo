type ReconciliationTarget = { origin: string; secret: string };

export function reconciliationTargets(raw: string | undefined): ReconciliationTarget[] {
  if (!raw?.trim()) return [];
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values) || values.length > 5) throw new Error("Invalid reconciliation targets");
  return values.map((value) => {
    if (!value || typeof value !== "object") throw new Error("Invalid reconciliation target");
    const { origin, secret } = value as Record<string, unknown>;
    if (typeof origin !== "string" || typeof secret !== "string" || !secret.trim()) {
      throw new Error("Invalid reconciliation target");
    }
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.username || url.password || url.origin !== origin) {
      throw new Error("Invalid reconciliation origin");
    }
    return { origin, secret };
  });
}

export async function reconcileConfiguredEnvironments(
  raw: string | undefined = process.env.CLASSROOM_RECONCILIATION_TARGETS,
  fetchImpl: typeof fetch = fetch,
) {
  return Promise.all(reconciliationTargets(raw).map(async ({ origin, secret }) => {
    const response = await fetchImpl(`${origin}/api/cron/promote-course-status`, {
      headers: {
        Authorization: `Bearer ${secret}`,
        "x-classroom-reconciliation-forwarded": "1",
      },
      redirect: "error",
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Reconciliation failed for ${origin} (${response.status})`);
    return { origin, ok: true };
  }));
}
