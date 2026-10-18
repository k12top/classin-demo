import type { ClassroomBoardItem } from "./types";

/** Suspend the board view during screen sharing without changing its saved layout. */
export function classroomBoardPresentation(
  savedItems: readonly ClassroomBoardItem[],
  whiteboardActive: boolean,
  hiddenItemIds: ReadonlySet<string>,
) {
  const boardItems = whiteboardActive
    ? savedItems.filter((item) => item.kind !== "screen")
    : [];
  const cameraSourceIds = new Set(
    boardItems
      .filter((item) => item.kind === "camera" && item.visible && !hiddenItemIds.has(item.id))
      .map((item) => item.sourceId),
  );
  return { boardItems, cameraSourceIds };
}
