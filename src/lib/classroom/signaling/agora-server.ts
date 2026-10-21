import { serverRtmConfiguration, serverRtmPublisherId, assertClientSignalingIdentity } from "./server-publisher";
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
  const server = serverRtmConfiguration();
  if (server) assertClientSignalingIdentity(courseId, normalizedUserId, server);
  return {
    provider: "agora-rtm",
    ...(server && { serverPublisherId: serverRtmPublisherId(courseId, server) }),
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
