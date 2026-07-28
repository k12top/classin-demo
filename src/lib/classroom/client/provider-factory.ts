"use client";

import type {
  ClassroomMediaProvider,
  ClassroomProviderName,
} from "@/lib/classroom/types";

export async function createClassroomMediaProvider(
  provider: ClassroomProviderName,
): Promise<ClassroomMediaProvider> {
  switch (provider) {
    case "agora": {
      const { AgoraRtcMediaProvider } = await import(
        "@/lib/classroom/providers/agora/client"
      );
      return new AgoraRtcMediaProvider();
    }
  }
}
