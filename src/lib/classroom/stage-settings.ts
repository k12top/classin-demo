import type { ClassroomModePolicy } from "./mode";

// This bounds the classroom setting, not the media provider's capacity.
export const MAX_CLASSROOM_STAGE_STUDENTS = 100;

export function validStageStudentLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_CLASSROOM_STAGE_STUDENTS;
}

/** A null override uses the mode default; a null result follows all entrants. */
export function classroomStudentStageLimit(
  mode: Pick<ClassroomModePolicy, "maxStageStudents">,
  runtime: { stageStudentLimit?: number | null } | null | undefined,
) {
  return validStageStudentLimit(runtime?.stageStudentLimit) ? runtime.stageStudentLimit : mode.maxStageStudents;
}
