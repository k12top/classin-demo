import { classroomMediaProfile } from "./config";

/** Share first, then visible camera thumbnails; audio is never budgeted away. */
export function screenVideoPlan(visible: readonly { id: string }[], isScreen: (id: string) => boolean, observedPixels: ReadonlyMap<string, number> = new Map()): Map<string, 0 | 1> | null {
  if (!visible.some(item => isScreen(item.id))) return null;
  const { screen, camera } = classroomMediaProfile;
  // Keep room for visible low-stream cameras even when the share is 1080p.
  // An older or external publisher may exceed that size; still keep its
  // share and the same thumbnail allowance instead of hiding every camera.
  const thumbnailAllowance = 12 * camera.low.width * camera.low.height;
  const largestShare = Math.max(1920 * 1080, ...visible.filter(item => isScreen(item.id)).map(item => observedPixels.get(item.id) ?? 0));
  let remaining = largestShare + thumbnailAllowance;
  const selected = new Set<string>();
  for (const item of [...visible.filter(item => isScreen(item.id)), ...visible.filter(item => !isScreen(item.id))]) {
    const pixels = Math.max(observedPixels.get(item.id) ?? 0, isScreen(item.id) ? screen.width * screen.height : camera.low.width * camera.low.height);
    if (selected.has(item.id) || pixels > remaining) continue;
    selected.add(item.id);
    remaining -= pixels;
  }
  return new Map(visible.filter(item => selected.has(item.id)).map(({ id }) => [id, isScreen(id) ? 0 : 1]));
}
