import "server-only";

import { classroomSignalingUserId } from "./identity";
import { RtmTokenBuilder } from "agora-token";
import type { ClassroomSignalingCredential } from "@/lib/classroom/types";

const RTM_TOKEN_TTL_SECONDS = 6 * 60 * 60;

export function issueAgoraSignalingCredential(
  courseId: string,
  userId: string,
): ClassroomSignalingCredential | null {
  const appId = process.env.AGORA_APP_ID?.trim();
  const appCertificate = process.env.AGORA_APP_CERTIFICATE?.trim();
  if (!appId || !appCertificate) return null;
  const normalizedUserId = classroomSignalingUserId(userId);
  return {
    provider: "agora-rtm",
    appId,
    userId: normalizedUserId,
    channelName: `classroom-${courseId}`,
    token: RtmTokenBuilder.buildToken(
      appId,
      appCertificate,
      normalizedUserId,
      RTM_TOKEN_TTL_SECONDS,
    ),
    expiresInSeconds: RTM_TOKEN_TTL_SECONDS,
  };
}
