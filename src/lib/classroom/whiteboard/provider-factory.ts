import "server-only";

import { NetlessWhiteboardProvider } from "@/lib/classroom/whiteboard/netless-server";
import type { ClassroomWhiteboardProvider } from "@/lib/classroom/whiteboard/types";

export function getWhiteboardProvider(): ClassroomWhiteboardProvider {
  return new NetlessWhiteboardProvider();
}
