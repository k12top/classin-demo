import "server-only";

import type {
  ClassroomServerProvider,
  RecordingProvider,
} from "@/lib/classroom/server/types";
import type { ClassroomProviderName } from "@/lib/classroom/types";
import {
  AgoraClassroomServerProvider,
  AgoraCloudRecordingProvider,
} from "@/lib/classroom/providers/agora/server";

function normalizeProvider(
  value: string | null | undefined,
  capability: string,
): ClassroomProviderName {
  const provider = (value || "agora").trim().toLowerCase();
  if (provider === "agora") return provider;
  throw new Error(`Unsupported ${capability} provider: ${provider}`);
}

export function getClassroomServerProvider(
  preferred?: string | null,
): ClassroomServerProvider {
  const name = normalizeProvider(
    preferred || process.env.CLASSROOM_MEDIA_PROVIDER,
    "classroom media",
  );

  switch (name) {
    case "agora":
      return new AgoraClassroomServerProvider();
  }
}

export function getRecordingProvider(
  preferred?: string | null,
): RecordingProvider {
  const name = normalizeProvider(
    preferred || process.env.CLASSROOM_RECORDING_PROVIDER,
    "recording",
  );

  switch (name) {
    case "agora":
      return new AgoraCloudRecordingProvider();
  }
}

