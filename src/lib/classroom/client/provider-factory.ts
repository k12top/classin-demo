"use client";

import type {
  ClassroomMediaProvider,
  ClassroomProviderName,
} from "@/lib/classroom/types";
import { installAgoraSdpCompatibility } from "@/lib/classroom/rtc-sdp-compat";

export async function createClassroomMediaProvider(
  provider: ClassroomProviderName,
): Promise<ClassroomMediaProvider> {
  switch (provider) {
    case "agora": {
      installAgoraSdpCompatibility();
      const { AgoraRtcMediaProvider } = await import(
        "@/lib/classroom/providers/agora/client"
      );
      return new AgoraRtcMediaProvider();
    }
  }
}
