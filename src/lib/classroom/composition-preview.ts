import { updateClassroomBoardItem } from "./composition";
import type { ClassroomRuntimeSnapshot } from "./types";
import type { ClassroomCompositionPreview } from "./signaling/types";

/** Shared layout previews have the same management boundary as saved edits. */
export function applyClassroomCompositionPreview(
  runtime: ClassroomRuntimeSnapshot,
  preview: ClassroomCompositionPreview,
  publisherId: string | undefined,
  currentUserId: string,
): ClassroomRuntimeSnapshot | null {
  const actor = runtime.members.find(member => member.userId === preview.actorId);
  const item = runtime.composition.boardItems.find(candidate => candidate.id === preview.itemId);
  if (runtime.status === "ended" || preview.actorId === currentUserId || !publisherId ||
    !actor?.signalingUserIds?.includes(publisherId) ||
    !(actor.role === "teacher" || actor.role === "assistant") ||
    !item || item.locked || !preview.rect ||
    ![preview.rect.x, preview.rect.y, preview.rect.width, preview.rect.height].every(Number.isFinite)) return null;
  return {
    ...runtime,
    composition: updateClassroomBoardItem(runtime.composition, preview.itemId, { rect: preview.rect }),
  };
}
