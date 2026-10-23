/** Screen sharing must keep every visible camera subscribed, including the sharer's. */
export function screenVideoPlan(visible: readonly { id: string }[], isScreen: (id: string) => boolean): Map<string, 0 | 1> | null {
  if (!visible.some(item => isScreen(item.id))) return null;
  return new Map(visible.map(({ id }) => [id, isScreen(id) ? 0 : 1]));
}
