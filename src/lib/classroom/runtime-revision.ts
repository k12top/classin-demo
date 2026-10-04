/** Prevent a late HTTP response from rolling the classroom back in time. */
export function shouldApplyClassroomRevision(
  currentRevision: number,
  incomingRevision: number | undefined,
) {
  return incomingRevision === undefined || incomingRevision >= currentRevision;
}
