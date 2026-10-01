"use client";

import type {
  ClassroomSignalingEvent,
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
  private generation = 0;

  async connect(
    credential: ClassroomSignalingCredential,
    onEvent: (event: ClassroomSignalingEvent) => void,
  ): Promise<void> {
    if (this.client) return;
    const generation = ++this.generation;
    const rtmModule = await import("agora-rtm");
    if (generation !== this.generation) return;
    const RTM = rtmModule.default.RTM as unknown as new (
      appId: string,
      userId: string,
    ) => AgoraRtmClient;
    const client = new RTM(credential.appId, credential.userId);
    client.addEventListener("message", (event) => {
      const raw = event.message;
      if (typeof raw !== "string") return;
      try {
        const parsed = JSON.parse(raw) as ClassroomSignalingEvent;
        if (
          parsed &&
          typeof parsed.courseId === "string" &&
          (Number.isInteger("revision" in parsed ? parsed.revision : NaN) ||
            (parsed.topic === "composition-preview" &&
              typeof parsed.itemId === "string" &&
              typeof parsed.actorId === "string"))
        ) {
          onEvent(parsed);
        }
      } catch {
        // The channel may be shared with older clients. Ignore unknown payloads.
      }
    });
    this.client = client;
    this.channelName = credential.channelName;
    try {
      await client.login({ token: credential.token });
      if (generation !== this.generation) { await client.logout().catch(() => undefined); return; }
      await client.subscribe(credential.channelName);
      if (generation !== this.generation) {
        await client.unsubscribe(credential.channelName).catch(() => undefined);
        await client.logout().catch(() => undefined);
      }
    } catch (error) {
      if (this.client === client) { this.client = null; this.channelName = ""; }
      await client.logout().catch(() => undefined);
      throw error;
    }
  }

  async publish(event: ClassroomSignalingEvent): Promise<void> {
    if (!this.client || !this.channelName) return;
    await this.client.publish(this.channelName, JSON.stringify(event), {
      channelType: "MESSAGE",
    });
  }

  async disconnect(): Promise<void> {
    this.generation += 1;
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
