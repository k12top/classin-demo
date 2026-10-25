import { classroomMediaProfile } from "./config";

/** Share first, then visible camera thumbnails; audio is never budgeted away. */
export function screenVideoPlan(visible: readonly { id: string }[], isScreen: (id: string) => boolean, observedPixels: ReadonlyMap<string, number> = new Map()): Map<string, 0 | 1> | null {
  if (!visible.some(item => isScreen(item.id))) return null;
  let remaining = 1920 * 1080;
  const { screen, camera } = classroomMediaProfile;
  const selected = new Set<string>();
  for (const item of [...visible.filter(item => isScreen(item.id)), ...visible.filter(item => !isScreen(item.id))]) {
    const pixels = Math.max(observedPixels.get(item.id) ?? 0, isScreen(item.id) ? screen.width * screen.height : camera.low.width * camera.low.height);
    if (selected.has(item.id) || pixels > remaining) continue;
    selected.add(item.id);
    remaining -= pixels;
  }
  return new Map(visible.filter(item => selected.has(item.id)).map(({ id }) => [id, isScreen(id) ? 0 : 1]));
}
