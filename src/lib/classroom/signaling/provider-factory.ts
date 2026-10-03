"use client";

import { AgoraRtmSignalingProvider } from "@/lib/classroom/signaling/agora-client";
import type { ClassroomSignalingProvider } from "@/lib/classroom/signaling/types";

export function createClassroomSignalingProvider(): ClassroomSignalingProvider {
  return new AgoraRtmSignalingProvider();
}
