"use client";

import type {
  ClassroomSignalingEvent,
  ClassroomDeviceAck,
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
    options: { channelType: "MESSAGE" | "USER" },
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
  private ready = false;
  private onHealth?: (ready: boolean) => void;

  async connect(
    credential: ClassroomSignalingCredential,
    onEvent: (event: ClassroomSignalingEvent, publisherId?: string) => void,
    onHealth?: (ready: boolean) => void,
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
    this.onHealth = onHealth;
    const health = (ready: boolean) => {
      if (generation !== this.generation) return;
      this.ready = ready;
      onHealth?.(ready);
    };
    let linkVersion = 0;
    let connectionAvailable = true;
    client.addEventListener("linkState", event => {
      if (generation !== this.generation || event.serviceType !== "MESSAGE") return;
      const version = ++linkVersion;
      connectionAvailable = event.currentState === "CONNECTED";
      health(false);
      if (!connectionAvailable) return;
      // The initial subscription is completed below. On later connections the
      // SDK reports whether subscription state survived the interruption.
      if (event.previousState === "IDLE" || event.operation === "LOGIN") return;
      const unrestored = Array.isArray(event.unrestoredChannels) && event.unrestoredChannels.includes(credential.channelName);
      const restore = event.isResumed === true && !unrestored ? Promise.resolve() : client.subscribe(credential.channelName);
      void restore.then(() => { if (version === linkVersion) health(true); }, () => { if (version === linkVersion) health(false); });
    });
    client.addEventListener("message", (event) => {
      const raw = event.message;
      if (generation !== this.generation || typeof raw !== "string" || raw.length > 32_000) return;
      try {
        const parsed = JSON.parse(raw) as ClassroomSignalingEvent;
        if (
          parsed &&
          typeof parsed.courseId === "string" &&
          ((Number.isSafeInteger("revision" in parsed ? parsed.revision : NaN) && "revision" in parsed && parsed.revision >= 0) ||
            (parsed.topic === "composition-preview" &&
              typeof parsed.itemId === "string" &&
              typeof parsed.actorId === "string"))
        ) {
          onEvent(parsed, typeof event.publisher === "string" ? event.publisher : undefined);
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
      health(connectionAvailable);
      if (generation !== this.generation) {
        await client.unsubscribe(credential.channelName).catch(() => undefined);
        await client.logout().catch(() => undefined);
      }
    } catch (error) {
      health(false);
      if (this.client === client) { this.client = null; this.channelName = ""; }
      await client.logout().catch(() => undefined);
      throw error;
    }
  }

  async publish(event: ClassroomSignalingEvent): Promise<void> {
    if (!this.client || !this.channelName || !this.ready) throw new Error("CLASSROOM_SIGNALING_UNAVAILABLE");
    await this.client.publish(this.channelName, JSON.stringify(event), {
      channelType: "MESSAGE",
    });
  }

  async publishToUser(userId: string, event: ClassroomDeviceAck): Promise<void> {
    if (!this.client || !this.ready) throw new Error("CLASSROOM_SIGNALING_UNAVAILABLE");
    await this.client.publish(userId, JSON.stringify(event), { channelType: "USER" });
  }

  async disconnect(): Promise<void> {
    this.ready = false;
    this.onHealth?.(false);
    this.onHealth = undefined;
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
