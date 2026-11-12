type Box = { left: number; top: number; right: number; bottom: number };
type CaptureRect = { x: number; y: number; width: number; height: number };

/** Capture only visible seats, excluding scroll overflow and empty rail space. */
export function visibleFloatingSeatBounds(rail: Box, seats: readonly Box[], viewport: { width: number; height: number }): CaptureRect | null {
  const clip = { left: Math.max(0, rail.left), top: Math.max(0, rail.top), right: Math.min(viewport.width, rail.right), bottom: Math.min(viewport.height, rail.bottom) };
  const visible = seats.map(seat => ({ left: Math.max(clip.left, seat.left), top: Math.max(clip.top, seat.top), right: Math.min(clip.right, seat.right), bottom: Math.min(clip.bottom, seat.bottom) })).filter(seat => seat.right > seat.left && seat.bottom > seat.top);
  if (!visible.length) return null;
  const left = Math.min(...visible.map(seat => seat.left)), top = Math.min(...visible.map(seat => seat.top));
  const right = Math.max(...visible.map(seat => seat.right)), bottom = Math.max(...visible.map(seat => seat.bottom));
  return right - left >= 32 && bottom - top >= 24 ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}
