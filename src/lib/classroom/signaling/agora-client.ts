"use client";

import type {
  ClassroomInvalidation,
  ClassroomSignalingProvider,
} from "@/lib/classroom/signaling/types";
import type { ClassroomSignalingCredential } from "@/lib/classroom/types";

type AgoraRtmClient = {
  addEventListener(
    event: string,
    listener: (event: Record<string, unknown>) => void,
  ): void;
  login(options: { token: string }): Promise<unknown>;
  subscribe(channelName: string): Promise<unknown>;
  publish(
    channelName: string,
    message: string,
    options: { channelType: "MESSAGE" },
  ): Promise<unknown>;
  unsubscribe(channelName: string): Promise<unknown>;
  logout(): Promise<unknown>;
};

export class AgoraRtmSignalingProvider
  implements ClassroomSignalingProvider
{
  private client: AgoraRtmClient | null = null;
  private channelName = "";

  async connect(
    credential: ClassroomSignalingCredential,
    onInvalidation: (event: ClassroomInvalidation) => void,
  ): Promise<void> {
    if (this.client) return;
    const rtmModule = await import("agora-rtm");
    const RTM = rtmModule.default.RTM as unknown as new (
      appId: string,
      userId: string,
    ) => AgoraRtmClient;
    const client = new RTM(credential.appId, credential.userId);
    client.addEventListener("message", (event) => {
      const raw = event.message;
      if (typeof raw !== "string") return;
      try {
        const parsed = JSON.parse(raw) as ClassroomInvalidation;
        if (
          parsed &&
          typeof parsed.courseId === "string" &&
          Number.isInteger(parsed.revision)
        ) {
          onInvalidation(parsed);
        }
      } catch {
        // The channel may be shared with older clients. Ignore unknown payloads.
      }
    });
    await client.login({ token: credential.token });
    await client.subscribe(credential.channelName);
    this.client = client;
    this.channelName = credential.channelName;
  }

  async publish(event: ClassroomInvalidation): Promise<void> {
    if (!this.client || !this.channelName) return;
    await this.client.publish(this.channelName, JSON.stringify(event), {
      channelType: "MESSAGE",
    });
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    const channelName = this.channelName;
    this.client = null;
    this.channelName = "";
    if (!client) return;
    if (channelName) {
      await client.unsubscribe(channelName).catch(() => undefined);
    }
    await client.logout().catch(() => undefined);
  }
}
