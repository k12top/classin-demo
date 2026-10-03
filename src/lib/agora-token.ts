import { ApaasTokenBuilder } from "agora-token/src/ApaasTokenBuilder";

/**
 * Generate a room-user token for the classroom runtime.
 * This must only be called on the server side.
 */
export function buildRoomUserToken(
  roomUuid: string,
  userUuid: string,
  role: number
): string {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    throw new Error(
      "Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE in environment variables"
    );
  }

  // Token expires in 86400 seconds (24 hours) to prevent TOKEN_EXPIRED during live streams
  const expire = 86400;

  return ApaasTokenBuilder.buildRoomUserToken(
    appId,
    appCertificate,
    roomUuid,
    userUuid,
    role,
    expire
  );
}
