import type { ClassroomJoinCredential } from "./types";

type AgoraConnection<TTrack> = {
  connectionState: string;
  renewToken(token: string): Promise<void>;
  join(appId: string, channel: string, token: string, uid: number): Promise<unknown>;
  publish(tracks: TTrack[]): Promise<void>;
  leave(): Promise<void>;
};

/** An expired/disconnected participant must join with the new token. */
export async function renewAgoraConnection<TTrack>(
  client: AgoraConnection<TTrack>,
  credential: Pick<ClassroomJoinCredential, "appId" | "channelName" | "token" | "rtcUid">,
  tracks: TTrack[],
  isCurrent: () => boolean,
  expired = false,
): Promise<void> {
  if (!isCurrent()) throw new DOMException("Classroom left", "AbortError");
  if (!expired && client.connectionState !== "DISCONNECTED") {
    await client.renewToken(credential.token);
    if (!isCurrent()) throw new DOMException("Classroom left", "AbortError");
    return;
  }
  if (expired && client.connectionState !== "DISCONNECTED") {
    await client.leave();
    if (!isCurrent()) throw new DOMException("Classroom left", "AbortError");
  }
  await client.join(credential.appId, credential.channelName, credential.token, credential.rtcUid);
  if (!isCurrent()) {
    await client.leave().catch(() => undefined);
    throw new DOMException("Classroom left", "AbortError");
  }
  if (tracks.length) await client.publish(tracks);
  if (!isCurrent()) {
    await client.leave().catch(() => undefined);
    throw new DOMException("Classroom left", "AbortError");
  }
}
