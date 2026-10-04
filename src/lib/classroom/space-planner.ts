export type LargeClassSpacePlanInput = {
  id: string;
  position: number;
  capacity: number | null;
};

export type LargeClassRosterPlanInput = {
  userId: string;
  role: "assistant" | "student";
};

export type LargeClassAssignment = {
  spaceId: string;
  userId: string;
  role: "assistant" | "student";
};

export function planLargeClassAssignments(
  spaces: LargeClassSpacePlanInput[],
  roster: LargeClassRosterPlanInput[],
): LargeClassAssignment[] {
  if (spaces.length === 0) return [];
  const orderedSpaces = [...spaces].sort((a, b) => a.position - b.position);
  const assistants = roster.filter((member) => member.role === "assistant");
  const students = roster.filter((member) => member.role === "student");
  const capacity = orderedSpaces.reduce(
    (total, space) => total + (space.capacity ?? students.length),
    0,
  );
  if (students.length > capacity) {
    throw new RangeError("large_class_capacity_exceeded");
  }
  const counts = new Map(orderedSpaces.map((space) => [space.id, 0]));
  const assignments: LargeClassAssignment[] = assistants.map((member, index) => ({
    spaceId: orderedSpaces[index % orderedSpaces.length].id,
    userId: member.userId,
    role: member.role,
  }));
  for (const member of students) {
    const target = orderedSpaces
      .map((space) => ({ space, count: counts.get(space.id) || 0 }))
      .filter(({ space, count }) => space.capacity === null || count < space.capacity)
      .sort(
        (left, right) =>
          left.count - right.count || left.space.position - right.space.position,
      )[0];
    if (!target) throw new RangeError("large_class_capacity_exceeded");
    counts.set(target.space.id, target.count + 1);
    assignments.push({
      spaceId: target.space.id,
      userId: member.userId,
      role: member.role,
    });
  }
  return assignments;
}
