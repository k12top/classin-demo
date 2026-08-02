export type ClassroomSelectorCycle = {
  availableUserIds: string[];
  selectedUserIds: string[];
  restarted: boolean;
};

export function classroomSelectorCycle(
  candidateUserIds: string[],
  previousSelectedUserIds: string[],
): ClassroomSelectorCycle {
  const candidates = Array.from(
    new Set(candidateUserIds.filter((userId) => userId.trim())),
  );
  const candidateSet = new Set(candidates);
  const selectedUserIds = Array.from(
    new Set(previousSelectedUserIds.filter((userId) => candidateSet.has(userId))),
  );
  const selectedSet = new Set(selectedUserIds);
  const availableUserIds = candidates.filter((userId) => !selectedSet.has(userId));

  if (availableUserIds.length > 0) {
    return { availableUserIds, selectedUserIds, restarted: false };
  }

  return {
    availableUserIds: candidates,
    selectedUserIds: [],
    restarted: selectedUserIds.length > 0,
  };
}
