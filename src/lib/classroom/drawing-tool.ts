export function activeClassroomDrawingTool<T>(
  screenAnnotationActive: boolean,
  whiteboardTool: T,
  screenAnnotationTool: T,
): T {
  return screenAnnotationActive ? screenAnnotationTool : whiteboardTool;
}
