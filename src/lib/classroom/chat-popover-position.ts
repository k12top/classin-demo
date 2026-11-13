type Rect = { left: number; right: number; top: number; bottom: number };
type Size = { width: number; height: number };

const VIEWPORT_GUTTER = 12;
const TRIGGER_GAP = 8;

export function placeChatPopover(anchor: Rect, popover: Size, viewport: Size) {
  const left = Math.max(
    VIEWPORT_GUTTER,
    Math.min(viewport.width - popover.width - VIEWPORT_GUTTER, anchor.right - popover.width),
  );
  const below = anchor.bottom + TRIGGER_GAP;
  const top = below + popover.height + VIEWPORT_GUTTER <= viewport.height
    ? below
    : Math.max(VIEWPORT_GUTTER, anchor.top - popover.height - TRIGGER_GAP);

  return { left, top };
}
