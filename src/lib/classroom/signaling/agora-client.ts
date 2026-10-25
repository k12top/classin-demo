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
  removeEventListener?(
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

type RtmLease = {
  client: AgoraRtmClient;
  tail: Promise<void>;
  owner?: AgoraRtmSignalingProvider;
};
// The SDK reserves app/user pairs for the lifetime of its constructor, even
// after logout. Retain the public client across retries and Fast Refresh.
// Keying by constructor also follows a genuinely reloaded SDK's lifetime.
const rtmGlobal = globalThis as typeof globalThis & {
  __classroomRtmClients?: WeakMap<object, Map<string, RtmLease>>;
};
const rtmClients = rtmGlobal.__classroomRtmClients ??= new WeakMap();

export class AgoraRtmSignalingProvider
  implements ClassroomSignalingProvider
{
  private client: AgoraRtmClient | null = null;
  private channelName = "";
  private generation = 0;
  private ready = false;
  private onHealth?: (ready: boolean) => void;
  private lease: RtmLease | null = null;
  private removeListeners?: () => void;

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
    let clients = rtmClients.get(RTM);
    if (!clients) { clients = new Map(); rtmClients.set(RTM, clients); }
    const key = JSON.stringify([credential.appId, credential.userId]);
    let lease = clients.get(key);
    if (!lease) {
      lease = { client: new RTM(credential.appId, credential.userId), tail: Promise.resolve() };
      clients.set(key, lease);
    }
    // A replacement invalidates old callbacks immediately, then waits for the
    // previous login/unsubscribe/logout work before logging in again.
    if (lease.owner && lease.owner !== this) void lease.owner.disconnect();
    lease.owner = this;
    this.lease = lease;
    const client = lease.client;
    this.onHealth = onHealth;
    const health = (ready: boolean) => {
      if (generation !== this.generation) return;
      this.ready = ready;
      onHealth?.(ready);
    };
    let linkVersion = 0;
    let connectionAvailable = true;
    const onLinkState = (event: Record<string, unknown>) => {
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
    };
    const onMessage = (event: Record<string, unknown>) => {
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
    };
    this.client = client;
    this.channelName = credential.channelName;
    const connection = lease.tail.catch(() => undefined).then(async () => {
      if (generation !== this.generation) return;
      // logout removes SDK listeners, so attach only after prior cleanup.
      client.addEventListener("linkState", onLinkState);
      client.addEventListener("message", onMessage);
      this.removeListeners = () => {
        client.removeEventListener?.("linkState", onLinkState);
        client.removeEventListener?.("message", onMessage);
      };
      try {
        await client.login({ token: credential.token });
        if (generation !== this.generation) return;
        await client.subscribe(credential.channelName);
        health(connectionAvailable);
      } catch (error) {
        health(false);
        if (generation === this.generation) {
          this.removeListeners?.();
          this.removeListeners = undefined;
          this.client = null;
          this.channelName = "";
          this.lease = null;
          if (lease.owner === this) lease.owner = undefined;
        }
        await client.logout().catch(() => undefined);
        throw error;
      }
    });
    lease.tail = connection.catch(() => undefined);
    await connection;
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
    const lease = this.lease;
    this.client = null;
    this.channelName = "";
    this.lease = null;
    this.removeListeners?.();
    this.removeListeners = undefined;
    if (!client) return;
    if (lease?.owner === this) lease.owner = undefined;
    const cleanup = async () => {
      if (channelName) await client.unsubscribe(channelName).catch(() => undefined);
      await client.logout().catch(() => undefined);
    };
    const stopped = lease ? lease.tail.catch(() => undefined).then(cleanup) : cleanup();
    if (lease) lease.tail = stopped;
    await stopped;
  }
}
