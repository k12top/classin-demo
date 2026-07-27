"use client";

import type {
  ClassroomMediaProvider,
  ClassroomProviderName,
} from "@/lib/classroom/types";
import { AgoraRtcMediaProvider } from "@/lib/classroom/providers/agora/client";

export function createClassroomMediaProvider(
  provider: ClassroomProviderName,
): ClassroomMediaProvider {
  switch (provider) {
    case "agora":
      return new AgoraRtcMediaProvider();
  }
}

