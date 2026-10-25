"use client";

import { createSharePortrait, normalizeScreenShareOptions, screenShareProfile, supportsSharePortrait } from "@/lib/classroom/share-portrait";
import type { ClassroomScreenShareOptions } from "@/lib/classroom/types";
import { screenVideoPlan } from "@/lib/classroom/screen-video-plan";


import AgoraRTC, {
  type IAgoraRTCClient,
  type IAgoraRTCRemoteUser,
  type ICameraVideoTrack,
  type ILocalVideoTrack,
  type ILocalAudioTrack,
  type IMicrophoneAudioTrack,
  type UID,
} from "agora-rtc-sdk-ng";
import VirtualBackgroundExtension, {
  type IVirtualBackgroundProcessor,
} from "agora-extension-virtual-background";
import {
  classroomMediaProfile,
} from "@/lib/classroom/config";
import { isScreenShareUserId } from "@/lib/classroom/screen-share";
import { isClassroomScreenRtcUid, isClassroomAuxiliaryRtcUid } from "@/lib/classroom/rtc-uid";
import { decodeClassroomSttCaption } from "@/lib/classroom/stt-caption";
import { renewAgoraConnection } from "@/lib/classroom/agora-credential-recovery";
import {
  credentialCanPublish,
  type ClassroomConnectionState,
  type ClassroomCaptionListener,
  type ClassroomJoinCredential,
  type ClassroomMediaListener,
  type ClassroomMediaProvider,
  type ClassroomMediaSnapshot,
  type ClassroomParticipant,
  type ClassroomVideoBackgroundEffect,
} from "@/lib/classroom/types";

type ClassroomAgoraGlobal = typeof globalThis & {
  __classroomVirtualBackgroundExtension?: InstanceType<
    typeof VirtualBackgroundExtension
  >;
};

const classroomAgoraGlobal = globalThis as ClassroomAgoraGlobal;
const virtualBackgroundExtension =
  classroomAgoraGlobal.__classroomVirtualBackgroundExtension ??
  new VirtualBackgroundExtension();

if (!classroomAgoraGlobal.__classroomVirtualBackgroundExtension) {
  AgoraRTC.registerExtensions([virtualBackgroundExtension]);
  classroomAgoraGlobal.__classroomVirtualBackgroundExtension =
    virtualBackgroundExtension;
}

function participantId(uid: UID): string {
  return String(uid);
}

function connectionState(
  agoraState: string,
): ClassroomConnectionState {
  switch (agoraState) {
    case "CONNECTING":
      return "connecting";
    case "CONNECTED":
      return "connected";
    case "RECONNECTING":
      return "reconnecting";
    case "DISCONNECTING":
    case "DISCONNECTED":
      return "disconnected";
    default:
      return "idle";
  }
}

export class AgoraRtcMediaProvider implements ClassroomMediaProvider {
  private client: IAgoraRTCClient | null = null;
  private recoveryQueue: Promise<unknown> = Promise.resolve();
  private connectionGeneration = 0;
  private connectionSequence = 0;
  private auxiliaryClient: IAgoraRTCClient | null = null;
  private auxiliaryTrack: ICameraVideoTrack | null = null;
  private auxiliaryPendingTrack: ICameraVideoTrack | null = null;
  private auxiliaryGeneration = 0;
  private auxiliaryTeardown: Promise<void> = Promise.resolve();
  private auxiliaryStartTask: Promise<void> | null = null;
  private screenClient: IAgoraRTCClient | null = null;
  private screenStartVersion = 0;
  private screenCaptureTrack: ILocalVideoTrack | null = null;
  private sharePortrait: Awaited<ReturnType<typeof createSharePortrait>> | null = null;
  private portraitCameraSuppressed = false;
  private screenOptionsQueue: Promise<void> = Promise.resolve();
  private cameraPublicationQueue: Promise<void> = Promise.resolve();
  private credential: ClassroomJoinCredential | null = null;
  private displayName = "";
  private microphoneTrack: IMicrophoneAudioTrack | null = null;
  private microphoneAllowed = true;
  private microphoneRequestedOn = false;
  private microphonePublished = false;
  private microphoneObservers = new WeakSet<object>();
  private microphoneControlVersion = 0;
  private microphoneControlTail: Promise<void> = Promise.resolve();
  private microphoneOperation: Promise<boolean> | null = null;
  private microphoneToggleTail: Promise<unknown> = Promise.resolve();
  private cameraTrack: ICameraVideoTrack | null = null;
  private cameraPublished = false;
  private screenTrack: ILocalVideoTrack | null = null;
  private screenAudioTrack: ILocalAudioTrack | null = null;
  private preferredMicrophoneId: string | undefined;
  private preferredCameraId: string | undefined;
  private cameraDeviceBusy = false;
  private virtualBackgroundProcessor: IVirtualBackgroundProcessor | null = null;
  private virtualBackgroundEffect: ClassroomVideoBackgroundEffect = {
    type: "none",
  };
  private remoteUsers = new Map<string, IAgoraRTCRemoteUser>();
  private participants = new Map<string, ClassroomParticipant>();
  private videoElements = new Map<string, Set<HTMLElement>>();
  private videoTargetOwners = new WeakMap<HTMLElement, string>();
  private videoTargetObservers = new Map<HTMLElement, ResizeObserver>();
  private remoteVideoStreamTypes = new Map<string, 0 | 1>();
  private remoteObservedPixels = new Map<string, number>();
  private remoteVideoUpdate: Promise<void> = Promise.resolve();
  private remoteVideoUpdateScheduled = false;
  private listeners = new Set<ClassroomMediaListener>();
  private captionListeners = new Set<ClassroomCaptionListener>();
  private tokenExpiryListeners = new Set<() => void>();
  private snapshot: ClassroomMediaSnapshot = {
    connectionState: "idle",
    participants: [],
    network: {
      uplinkQuality: 0,
      downlinkQuality: 0,
      latencyMs: null,
      packetLossPercent: null,
    },
    local: {
      microphoneOn: false,
      cameraOn: false,
      screenSharing: false,
    },
    focusedParticipantId: null,
  };

  subscribe(listener: ClassroomMediaListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  subscribeCaptions(listener: ClassroomCaptionListener): () => void {
    this.captionListeners.add(listener);
    return () => this.captionListeners.delete(listener);
  }

  subscribeTokenExpiry(listener: () => void): () => void {
    this.tokenExpiryListeners.add(listener);
    return () => this.tokenExpiryListeners.delete(listener);
  }

  private emitTokenExpiry() {
    for (const listener of this.tokenExpiryListeners) listener();
  }

  getSnapshot(): ClassroomMediaSnapshot {
    return {
      ...this.snapshot,
      participants: this.snapshot.participants.map((participant) => ({
        ...participant,
      })),
      network: { ...this.snapshot.network },
      local: { ...this.snapshot.local },
    };
  }

  getActualDeviceState() {
    const microphone = this.microphoneTrack?.getMediaStreamTrack();
    const microphoneOn = this.microphonePublished && this.microphoneRequestedOn && this.microphoneAllowed && microphone?.enabled && microphone.readyState !== "ended" && !microphone.muted && !this.microphoneTrack?.muted;
    const camera = this.cameraTrack?.getMediaStreamTrack();
    const cameraOn = (this.cameraPublished || (this.portraitCameraSuppressed && this.snapshot.local.screenSharing)) && this.snapshot.local.cameraOn && camera?.readyState !== "ended" && camera?.enabled && !camera?.muted && !this.cameraTrack?.muted;
    return {
      microphone: microphoneOn ? "on" as const : microphone?.readyState === "ended" || microphone?.muted ? "interrupted" as const : this.snapshot.local.microphoneStatus === "starting" ? "pending" as const : this.snapshot.local.microphoneStatus || "off" as const,
      camera: cameraOn ? "on" as const : !this.snapshot.local.cameraOn ? "off" as const : camera?.readyState === "ended" || camera?.muted ? "interrupted" as const : this.cameraTrack && !this.cameraPublished ? "pending" as const : "off" as const,
    };
  }

  getMicrophoneLevel(id: string): number {
    const participant = this.participants.get(id);
    if (participant?.kind !== "camera" || !participant.hasAudio) return 0;
    const track = id === this.cameraId()
      ? this.snapshot.local.microphoneOn ? this.microphoneTrack : null
      : this.remoteUsers.get(id)?.audioTrack;
    const level = track?.getVolumeLevel() ?? 0;
    return Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  }

  private emit() {
    this.snapshot = {
      ...this.snapshot,
      participants: Array.from(this.participants.values()).sort((a, b) => {
        const ranks = { screen: 0, camera: 1, "auxiliary-camera": 2 };
        if (a.kind !== b.kind) return ranks[a.kind] - ranks[b.kind];
        if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      }),
    };
    const current = this.getSnapshot();
    for (const listener of this.listeners) listener(current);
  }

  private cameraId() {
    return this.credential ? String(this.credential.rtcUid) : undefined;
  }

  private screenId() {
    return this.credential?.screenShare
      ? String(this.credential.screenShare.rtcUid)
      : undefined;
  }

  private auxiliaryId() {
    return this.credential?.auxiliaryCamera ? String(this.credential.auxiliaryCamera.rtcUid) : undefined;
  }

  private isScreen(id: string) {
    return isClassroomScreenRtcUid(id) || isScreenShareUserId(id);
  }

  private isLocalParticipant(id: string) {
    return (
      id === this.cameraId() ||
      id === this.screenId() ||
      id === this.auxiliaryId()
    );
  }

  private displayNameFor(id: string) {
    if (id === this.cameraId()) return this.displayName;
    if (id === this.screenId()) {
      return `${this.displayName} · 屏幕`;
    }
    if (id === this.auxiliaryId()) return `${this.displayName} · 辅助摄像头`;
    return this.isScreen(id) ? "共享屏幕" : id;
  }

  private upsertParticipant(
    id: string,
    update: Partial<ClassroomParticipant> = {},
  ) {
    const existing = this.participants.get(id);
    this.participants.set(id, {
      id,
      displayName: this.displayNameFor(id),
      isLocal: this.isLocalParticipant(id),
      kind: this.isScreen(id) ? "screen" : isClassroomAuxiliaryRtcUid(id) ? "auxiliary-camera" : "camera",
      hasAudio: existing?.hasAudio ?? false,
      hasVideo: existing?.hasVideo ?? false,
      ...existing,
      ...update,
    });
    this.emit();
  }

  private mediaStreamTrackFor(id: string): MediaStreamTrack | null {
    if (id === this.cameraId()) {
      return this.snapshot.local.cameraOn ? this.cameraTrack?.getMediaStreamTrack() ?? null : null;
    }
    if (id === this.screenId()) {
      return this.screenTrack?.getMediaStreamTrack() ?? null;
    }
    if (id === this.auxiliaryId()) return this.auxiliaryTrack?.getMediaStreamTrack() ?? null;
    return this.remoteUsers.get(id)?.videoTrack?.getMediaStreamTrack() ?? null;
  }

  private clearVideoTarget(element: HTMLElement) {
    for (const video of element.querySelectorAll("video")) {
      video.pause();
      video.srcObject = null;
    }
    element.replaceChildren();
  }

  private renderVideoTarget(id: string, element: HTMLElement) {
    if (this.videoTargetOwners.get(element) !== id) return;
    const track = this.mediaStreamTrackFor(id);
    if (!track || track.readyState === "ended") { this.clearVideoTarget(element); return; }
    const existing = element.querySelector("video");
    if (existing?.srcObject instanceof MediaStream && existing.srcObject.getVideoTracks()[0] === track) {
      if (existing.paused) this.playVideoTarget(id, element, existing);
      return;
    }
    this.clearVideoTarget(element);

    const video = document.createElement("video");
    video.className = "classroom-v3-native-video";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.dataset.fit = this.isScreen(id) || isClassroomAuxiliaryRtcUid(id) ? "contain" : "cover";
    video.dataset.mirror =
      id === this.cameraId() && !this.isScreen(id)
        ? "true"
        : "false";
    video.srcObject = new MediaStream([track]);
    element.appendChild(video);
    this.playVideoTarget(id, element, video);
  }

  private playVideoTarget(id: string, element: HTMLElement, video: HTMLVideoElement) {
    void video.play().catch((error: unknown) => {
      console.warn("[classroom:video] playback interrupted", { isLocal: this.isLocalParticipant(id), message: error instanceof Error ? error.message : "Playback failed" });
      requestAnimationFrame(() => {
        if (video.parentElement === element && video.srcObject && video.paused) {
          void video.play().catch((retryError: unknown) => {
            console.warn("[classroom:video] playback retry failed", { message: retryError instanceof Error ? retryError.message : "Playback failed" });
          });
        }
      });
    });
  }

  private renderVideoTargets(id: string) {
    for (const element of this.videoElements.get(id) ?? []) {
      this.renderVideoTarget(id, element);
    }
  }

  private clearVideoTargets(id: string) {
    for (const element of this.videoElements.get(id) ?? []) {
      this.clearVideoTarget(element);
    }
  }

  private remoteVideoPlan(): Map<string, 0 | 1> {
    const visible = Array.from(this.remoteUsers.entries()).flatMap(([id, user]) => {
      if (!user.hasVideo || this.isLocalParticipant(id)) return [];
      let area = 0;
      let enlarged = false;
      for (const element of this.videoElements.get(id) ?? []) {
        const { width, height } = element.getBoundingClientRect();
        if (width <= 0 || height <= 0) continue;
        area = Math.max(area, width * height);
        enlarged ||= width > classroomMediaProfile.camera.low.width || height > classroomMediaProfile.camera.low.height;
      }
      return area > 0 ? [{ id, area, enlarged }] : [];
    }).sort((a, b) => Number(this.isScreen(b.id)) - Number(this.isScreen(a.id)) ||
      Number(b.id === this.snapshot.focusedParticipantId) - Number(a.id === this.snapshot.focusedParticipantId) ||
      b.area - a.area || a.id.localeCompare(b.id));
    const plan = new Map<string, 0 | 1>();
    // Reserve FHD before the first receive sample. Never briefly subscribe
    // thumbnails beside an unknown 1080p composite while waiting for stats.
    const pixels = new Map(this.remoteObservedPixels);
    for (const { id } of visible) if (this.isScreen(id) && !pixels.has(id)) pixels.set(id, 1920 * 1080);
    const sharingPlan = screenVideoPlan(visible, id => this.isScreen(id), pixels);
    if (sharingPlan) return sharingPlan;
    const low = classroomMediaProfile.camera.low;
    const high = classroomMediaProfile.camera.high;
    const lowPixels = low.width * low.height;
    let remaining = 1920 * 1080;
    for (const { id } of visible) {
      const pixels = Math.max(lowPixels, this.remoteObservedPixels.get(id) ?? 0);
      if (remaining < pixels) continue;
      plan.set(id, 1);
      remaining -= pixels;
    }
    for (const { id, enlarged } of visible) {
      const extra = Math.max(0, high.width * high.height - Math.max(lowPixels, this.remoteObservedPixels.get(id) ?? 0));
      if (plan.has(id) && (enlarged || id === this.snapshot.focusedParticipantId) && remaining >= extra) {
        plan.set(id, 0);
        remaining -= extra;
      }
    }
    return plan;
  }

  private updateRemoteVideos(): Promise<void> {
    // Coalesce layout notifications and serialize the whole receive plan, so
    // previous high streams are downgraded before a new focus is upgraded.
    if (this.remoteVideoUpdateScheduled) return this.remoteVideoUpdate;
    this.remoteVideoUpdateScheduled = true;
    const client = this.client;
    this.remoteVideoUpdate = this.remoteVideoUpdate.catch(() => undefined).then(async () => {
      this.remoteVideoUpdateScheduled = false;
      if (!client || this.client !== client) return;
      const plan = this.remoteVideoPlan();
      const current = (id: string, user: IAgoraRTCRemoteUser) =>
        this.client === client && this.remoteUsers.get(id) === user && user.hasVideo;
      // Release subscriptions and high streams first, including hidden tiles.
      for (const [id, type] of this.remoteVideoStreamTypes) {
        const user = this.remoteUsers.get(id);
        if (!user || !current(id, user)) continue;
        const next = plan.get(id);
        if (next === undefined) {
          await client.unsubscribe(user, "video");
          if (!current(id, user)) continue;
          this.remoteVideoStreamTypes.delete(id);
          this.clearVideoTargets(id);
        } else if (type === 0 && next === 1) {
          await client.setRemoteVideoStreamType(user.uid, 1);
          if (current(id, user)) this.remoteVideoStreamTypes.set(id, 1);
        }
      }
      for (const [id, type] of plan) {
        const user = this.remoteUsers.get(id);
        if (!user || !current(id, user)) continue;
        try {
          if (this.remoteVideoStreamTypes.get(id) !== type) {
            await client.setRemoteVideoStreamType(user.uid, type);
            if (!current(id, user)) continue;
            if (!this.remoteVideoStreamTypes.has(id)) await client.subscribe(user, "video");
            if (!current(id, user)) continue;
            this.remoteVideoStreamTypes.set(id, type);
          }
          this.renderVideoTargets(id);
        } catch (error: unknown) {
          // A single unavailable publisher must not block the remaining tiles.
          console.warn("[ClassroomRTC] Failed to subscribe to remote video", error);
        }
      }
      if (this.client !== client) return;
      for (const [id, user] of this.remoteUsers) {
        if (user.hasVideo && !this.isLocalParticipant(id)) {
          const participant = this.participants.get(id);
          if (participant) participant.videoSubscriptionPaused = !this.remoteVideoStreamTypes.has(id);
        }
      }
      this.emit();
    }).catch((error: unknown) => {
      console.warn("[ClassroomRTC] Failed to update remote video subscriptions", error);
    });
    return this.remoteVideoUpdate;
  }

  private removeParticipant(id: string) {
    this.remoteObservedPixels.delete(id);
    this.remoteUsers.delete(id);
    this.participants.delete(id);
    this.clearVideoTargets(id);
    for (const element of this.videoElements.get(id) ?? []) {
      this.videoTargetObservers.get(element)?.disconnect();
      this.videoTargetObservers.delete(element);
    }
    this.videoElements.delete(id);
    this.remoteVideoStreamTypes.delete(id);
    if (this.snapshot.focusedParticipantId === id) {
      this.snapshot.focusedParticipantId = null;
    }
    this.emit();
    void this.updateRemoteVideos();
  }

  async connect(
    credential: ClassroomJoinCredential,
    displayName: string,
  ): Promise<void> {
    if (this.client) return;
    if (!AgoraRTC.checkSystemRequirements()) {
      throw new Error("当前浏览器不支持实时音视频，请使用最新版 Chrome 或 Safari");
    }

    this.credential = credential;
    this.displayName = displayName || credential.userId;
    this.snapshot.connectionState = "connecting";
    this.emit();

    const publishing = credentialCanPublish(credential);
    const liveBroadcasting = credential.scenario === "liveBroadcasting";
    const client = AgoraRTC.createClient({
      mode: liveBroadcasting ? "live" : "rtc",
      codec: "vp8",
      ...(liveBroadcasting && {
        role: publishing ? ("host" as const) : ("audience" as const),
      }),
    });
    this.client = client;

    client.on("connection-state-change", (state, previous, reason) => {
      if (this.client !== client) return;
      this.snapshot.connectionState = connectionState(state);
      this.snapshot.connectionEvent = {
        sequence: ++this.connectionSequence, state: connectionState(state),
        previousState: connectionState(previous), reason, occurredAt: new Date().toISOString(),
      };
      this.emit();
      if (state === "CONNECTED" && (previous === "RECONNECTING" || previous === "DISCONNECTED")) {
        void this.recoverMedia().catch((error) => {
          if (this.client === client) console.warn("[classroom:rtc] playback recovery failed", error);
        });
      }
    });
    this.watchTokenExpiry(client);
    client.on("network-quality", (quality) => {
      if (this.client !== client) return;
      // Some mobile browsers cannot honor a requested low stream. Budget
      // their measured receive size conservatively for the rest of this join.
      let changed = false;
      for (const [id, stats] of Object.entries(client.getRemoteVideoStats?.() ?? {})) {
        if (!this.isScreen(id) && this.remoteVideoStreamTypes.get(id) !== 1) continue;
        const pixels = stats.receiveResolutionWidth * stats.receiveResolutionHeight;
        if (Number.isFinite(pixels) && pixels > (this.remoteObservedPixels.get(id) ?? 0)) {
          this.remoteObservedPixels.set(id, pixels);
          changed = true;
        }
      }
      if (changed) void this.updateRemoteVideos();
      const rtcStats = client.getRTCStats();
      const audioLoss = client.getLocalAudioStats().currentPacketLossRate;
      const videoLoss = client.getLocalVideoStats().currentPacketLossRate;
      this.snapshot.network = {
        uplinkQuality: quality.uplinkNetworkQuality,
        downlinkQuality: quality.downlinkNetworkQuality,
        latencyMs: Number.isFinite(rtcStats.RTT) ? rtcStats.RTT : null,
        packetLossPercent: Number.isFinite(Math.max(audioLoss, videoLoss))
          ? Math.max(audioLoss, videoLoss)
          : null,
      };
      this.emit();
    });
    client.on("user-joined", (user) => {
      if (this.client !== client) return;
      const id = participantId(user.uid);
      if (id === this.auxiliaryId()) return;
      this.remoteUsers.set(id, user);
      this.upsertParticipant(id);
    });
    client.on("user-left", (user) => {
      if (this.client !== client || this.remoteUsers.get(participantId(user.uid)) !== user) return;
      if (participantId(user.uid) === this.auxiliaryId()) return;
      this.removeParticipant(participantId(user.uid));
    });
    client.on("user-published", (user, mediaType) => {
      void this.onUserPublished(user, mediaType).catch(error => {
        if (this.client === client) console.warn("[classroom:rtc] remote publication failed", error);
      });
    });
    client.on("user-unpublished", (user, mediaType) => {
      const id = participantId(user.uid);
      if (this.client !== client || this.remoteUsers.get(id) !== user) return;
      if (id === this.auxiliaryId()) return;
      if (mediaType === "video") {
        if (this.isScreen(id)) this.remoteObservedPixels.delete(id);
        this.remoteVideoStreamTypes.delete(id);
        this.clearVideoTargets(id);
      }
      this.upsertParticipant(id, {
        ...(mediaType === "audio" ? { hasAudio: false } : {}),
        ...(mediaType === "video" ? { hasVideo: false, videoSubscriptionPaused: false } : {}),
      });
      if (mediaType === "video") void this.updateRemoteVideos();
    });
    client.on("stream-message", (_uid, bytes) => {
      const caption = decodeClassroomSttCaption(bytes);
      if (!caption) return;
      for (const listener of this.captionListeners) listener(caption);
    });

    await client.join(
      credential.appId,
      credential.channelName,
      credential.token,
      credential.rtcUid,
    );

    if (this.client !== client) {
      client.removeAllListeners();
      await client.leave().catch(() => undefined);
      return;
    }

    this.upsertParticipant(String(credential.rtcUid), {
      isLocal: true,
      displayName: this.displayName,
    });

    if (publishing) {
      client.setLowStreamParameter({
        width: classroomMediaProfile.camera.low.width,
        height: classroomMediaProfile.camera.low.height,
        framerate: classroomMediaProfile.camera.low.frameRate,
        bitrate: classroomMediaProfile.camera.low.bitrateKbps,
      });
      // Dual-stream is an optional bandwidth optimization. Some browsers or
      // Agora SDK states can take a long time to resolve this promise even
      // after the RTC channel is connected, so it must not block classroom
      // entry. High-stream publishing remains available if this setup fails.
      void client.enableDualStream().catch((error: unknown) => {
        console.warn("[ClassroomRTC] Failed to enable dual stream", error);
      });
    }
  }

  private async onUserPublished(
    user: IAgoraRTCRemoteUser,
    mediaType: "audio" | "video" | "datachannel",
  ) {
    if (!this.client || mediaType === "datachannel") return;
    const client = this.client;
    const id = participantId(user.uid);
    if (id === this.auxiliaryId()) return;
    const sdkUser = client.remoteUsers.find(candidate => candidate.uid === user.uid);
    if (sdkUser && sdkUser !== user) return;
    this.remoteUsers.set(id, user);
    if (mediaType === "video" && this.isScreen(id)) this.remoteObservedPixels.delete(id);

    // The primary client receives the separate local screen publisher too.
    // Render the local capture directly instead of subscribing to ourselves.
    if (id === this.screenId()) {
      this.upsertParticipant(id, {
        isLocal: true,
        ...(mediaType === "video" ? { hasVideo: true } : { hasAudio: true }),
      });
      return;
    }

    if (mediaType === "audio") await client.subscribe(user, mediaType);
    if (this.client !== client || this.remoteUsers.get(id) !== user) return;
    if (mediaType === "audio" && user.audioTrack) {
      user.audioTrack.play();
      this.upsertParticipant(id, { hasAudio: true });
      return;
    }

    if (mediaType === "video") {
      this.remoteVideoStreamTypes.delete(id);
      this.upsertParticipant(id, { hasVideo: true, videoSubscriptionPaused: true });
      await this.updateRemoteVideos();
    }
  }

  private serializeRecovery(operation: () => Promise<void>): Promise<void> {
    const generation = this.connectionGeneration;
    const task = this.recoveryQueue.catch(() => undefined).then(async () => {
      if (generation !== this.connectionGeneration) throw new DOMException("Classroom left", "AbortError");
      await operation();
    });
    this.recoveryQueue = task;
    return task;
  }

  private expiredClients = new WeakSet<IAgoraRTCClient>();

  private watchTokenExpiry(client: IAgoraRTCClient) {
    client.on("token-privilege-will-expire", () => this.emitTokenExpiry());
    client.on("token-privilege-did-expire", () => {
      this.expiredClients.add(client);
      this.emitTokenExpiry();
    });
  }

  recoverMedia(force = false): Promise<void> {
    return this.serializeRecovery(() => this.recoverMediaNow(force));
  }

  private async recoverMediaNow(force: boolean): Promise<void> {
    if (!this.client || !this.credential) return;
    const client = this.client;
    const assertCurrent = () => { if (this.client !== client) throw new DOMException("Classroom left", "AbortError"); };
    if (client.connectionState === "DISCONNECTED") {
      const tracks = [this.portraitCameraSuppressed || !this.snapshot.local.cameraOn ? null : this.cameraTrack, this.microphoneTrack].filter((track): track is ICameraVideoTrack | IMicrophoneAudioTrack => Boolean(track && track.getMediaStreamTrack().readyState !== "ended"));
      await renewAgoraConnection(client, this.credential, tracks, () => this.client === client);
      this.cameraPublished = Boolean(this.cameraTrack && tracks.includes(this.cameraTrack));
    }
    assertCurrent();
    if (this.auxiliaryClient?.connectionState === "DISCONNECTED" && this.auxiliaryTrack && this.credential.auxiliaryCamera) {
      const auxiliaryClient = this.auxiliaryClient;
      const track = this.auxiliaryTrack;
      const identity = this.credential.auxiliaryCamera;
      await renewAgoraConnection(auxiliaryClient, { ...this.credential, ...identity }, [track], () => this.client === client && this.auxiliaryClient === auxiliaryClient);
      assertCurrent();
    }
    // A captured track is assigned before authorization and the first join.
    // Recovery must only rejoin a publisher whose initial start has completed.
    if (this.snapshot.local.screenSharing && this.screenClient?.connectionState === "DISCONNECTED" && this.credential.screenShare) {
      const screenClient = this.screenClient;
      const tracks = [this.screenTrack, this.screenAudioTrack].filter((track): track is ILocalVideoTrack | ILocalAudioTrack => Boolean(track));
      await renewAgoraConnection(screenClient, { ...this.credential, ...this.credential.screenShare }, tracks, () => this.client === client && this.screenClient === screenClient);
      assertCurrent();
    }
    // A live MediaStreamTrack can still belong to the pre-suspension transport.
    // Reconcile against the SDK's current users and invalidate our subscription
    // cache; merely calling play() on the old track leaves a frozen frame.
    if (client.connectionState !== "CONNECTED") return;
    await this.remoteVideoUpdate.catch(() => undefined);
    assertCurrent();
    const currentUsers = new Map(client.remoteUsers.map(user => [participantId(user.uid), user]));
    for (const id of this.remoteUsers.keys()) {
      if (currentUsers.has(id)) continue;
      this.remoteUsers.delete(id);
      this.remoteVideoStreamTypes.delete(id);
      this.participants.delete(id);
      this.clearVideoTargets(id);
    }
    for (const [id, user] of currentUsers) {
      if (this.isLocalParticipant(id)) continue;
      this.remoteUsers.set(id, user);
      if (this.isScreen(id)) this.remoteObservedPixels.delete(id);
      this.upsertParticipant(id, { hasVideo: user.hasVideo, hasAudio: user.hasAudio });
      // Reset video subscriptions even if the SDK retained a track object.
      // Rebuild them together through the receive budget, never one by one.
      await client.unsubscribe(user, "video").catch(() => undefined);
      assertCurrent();
      this.remoteVideoStreamTypes.delete(id);
      if (user.hasAudio) {
        try {
          await client.unsubscribe(user, "audio").catch(() => undefined);
          assertCurrent();
          await client.subscribe(user, "audio");
          assertCurrent();
          user.audioTrack?.play();
        } catch (error) {
          assertCurrent();
          console.warn("[classroom:rtc] remote audio recovery failed", error);
        }
      }
    }
    await this.updateRemoteVideos();
    assertCurrent();
    for (const id of this.videoElements.keys()) this.renderVideoTargets(id);
    // A browser cannot silently reacquire a screen after the OS ends capture.
    // Clear the sharing state so the teacher can explicitly start it again.
    if (this.screenTrack?.getMediaStreamTrack().readyState === "ended") {
      await this.stopScreenShare();
      assertCurrent();
    }
    const cameraWasOn = this.snapshot.local.cameraOn;
    if (cameraWasOn && this.cameraTrack && (force || this.cameraTrack.getMediaStreamTrack().readyState === "ended" || this.cameraTrack.getMediaStreamTrack().muted)) {
      const track = this.cameraTrack;
      this.cameraTrack = null;
      this.cameraPublished = false;
      this.snapshot.local.cameraOn = false;
      await client.unpublish(track).catch(() => undefined);
      track.close();
      assertCurrent();
      await this.toggleCamera();
      assertCurrent();
    }
    if (!this.microphoneOperation && this.microphoneAllowed && (this.microphoneRequestedOn || this.snapshot.local.microphoneOn) && (!this.microphoneTrack || force || this.microphoneTrack.getMediaStreamTrack().readyState === "ended" || this.microphoneTrack.getMediaStreamTrack().muted)) {
      const track = this.microphoneTrack;
      this.microphoneTrack = null;
      this.microphonePublished = false;
      this.snapshot.local.microphoneOn = false;
      this.snapshot.local.microphoneStatus = "starting";
      this.emit();
      if (track) { await client.unpublish(track).catch(() => undefined); track.close(); }
      assertCurrent();
      this.microphoneRequestedOn = false;
      const recoveryVersion = this.microphoneControlVersion + 1;
      try { await this.toggleMicrophone(); }
      catch (failure) {
        // A transient reacquisition failure must remain retryable. A newer
        // mute/moderation intent always wins over this recovery attempt.
        if (this.client === client && this.microphoneControlVersion === recoveryVersion && this.microphoneAllowed && this.credential && credentialCanPublish(this.credential)) {
          this.microphoneRequestedOn = true;
          this.snapshot.local.microphoneStatus = "failed";
          this.emit();
        }
        throw failure;
      }
    }
    await this.syncCameraPublication();
  }
  private synchronizeMicrophone(track: IMicrophoneAudioTrack) {
    if (this.microphoneTrack !== track) return;
    const native = track.getMediaStreamTrack();
    const live = native.readyState !== "ended" && !native.muted;
    this.snapshot.local.microphoneOn = this.microphoneRequestedOn && this.microphoneAllowed && this.microphonePublished && native.enabled && live && !track.muted;
    this.snapshot.local.microphoneStatus = this.snapshot.local.microphoneOn ? "on"
      : this.microphoneRequestedOn && !live ? "interrupted"
      : this.microphoneRequestedOn && !this.microphonePublished ? "starting" : "off";
    const id = this.cameraId();
    if (id) this.upsertParticipant(id, { hasAudio: this.snapshot.local.microphoneOn });
    else this.emit();
  }

  private observeMicrophone(track: IMicrophoneAudioTrack) {
    const synchronize = () => this.synchronizeMicrophone(track);
    if (!this.microphoneObservers.has(track)) {
      this.microphoneObservers.add(track);
      track.on?.("track-ended", synchronize);
    }
    const native = track.getMediaStreamTrack();
    if (!this.microphoneObservers.has(native)) {
      this.microphoneObservers.add(native);
      for (const event of ["ended", "mute", "unmute"]) native.addEventListener?.(event, synchronize);
    }
  }

  setMicrophonePermission(allowed: boolean): void {
    this.microphoneAllowed = allowed;
    if (!allowed) {
      ++this.microphoneControlVersion;
      this.microphoneRequestedOn = false;
      this.snapshot.local.microphoneOn = false;
      this.snapshot.local.microphoneStatus = "off";
    }
    if (this.microphoneTrack) {
      this.microphoneTrack.getMediaStreamTrack().enabled = allowed && this.microphoneRequestedOn;
      this.synchronizeMicrophone(this.microphoneTrack);
    } else this.emit();
  }

  async muteMicrophone(): Promise<void> {
    ++this.microphoneControlVersion;
    this.microphoneRequestedOn = false;
    this.snapshot.local.microphoneOn = false;
    this.snapshot.local.microphoneStatus = "off";
    const track = this.microphoneTrack;
    if (track) track.getMediaStreamTrack().enabled = false;
    this.emit();
    const changing = this.microphoneControlTail.then(async () => {
      if (track && this.microphoneTrack === track) {
        await track.setMuted(true);
        this.synchronizeMicrophone(track);
      }
    });
    this.microphoneControlTail = changing.then(() => undefined, () => undefined);
    await changing;
  }

  toggleMicrophone(): Promise<boolean> {
    if (!this.client || !this.credential) return Promise.reject(new Error("课堂尚未连接"));
    if (!credentialCanPublish(this.credential)) return Promise.reject(new Error("学生需要老师邀请上台后才能发言"));
    if (!this.microphoneAllowed) return Promise.reject(new Error("老师暂未允许发言"));
    const client = this.client, version = ++this.microphoneControlVersion;
    const previous = this.microphoneRequestedOn, next = !previous;
    // Record every click before waiting for the SDK. In-flight completion may
    // never enable native capture against the most recent mute intent.
    this.microphoneRequestedOn = next;
    if (this.microphoneTrack) this.microphoneTrack.getMediaStreamTrack().enabled = next && this.microphoneAllowed;
    if (!next) this.snapshot.local.microphoneOn = false;
    this.snapshot.local.microphoneStatus = next ? "starting" : "off";
    this.emit();
    const operation = this.microphoneOperation
      ? this.microphoneToggleTail.catch(() => undefined).then(() => this.applyMicrophoneIntent(client, next, previous, version))
      : this.applyMicrophoneIntent(client, next, previous, version);
    this.microphoneToggleTail = operation;
    this.microphoneOperation = operation;
    void operation.finally(() => { if (this.microphoneOperation === operation) this.microphoneOperation = null; }).catch(() => undefined);
    return operation;
  }

  private async applyMicrophoneIntent(client: IAgoraRTCClient, next: boolean, previous: boolean, version: number): Promise<boolean> {
    if (this.client !== client || !this.credential || !credentialCanPublish(this.credential) || (next && !this.microphoneAllowed)) throw new DOMException("Microphone authorization changed", "AbortError");
    if (!next && (!this.microphoneTrack || this.microphoneTrack.getMediaStreamTrack().readyState === "ended")) return false;
    try {
      if (!this.microphoneTrack || this.microphoneTrack.getMediaStreamTrack().readyState === "ended") {
        const old = this.microphoneTrack;
        this.microphoneTrack = null;
        this.microphonePublished = false;
        if (old) { await client.unpublish(old).catch(() => undefined); old.close(); }
        const track = await AgoraRTC.createMicrophoneAudioTrack({
          ...(this.preferredMicrophoneId && { microphoneId: this.preferredMicrophoneId }),
          AEC: true, AGC: true, ANS: true, encoderConfig: "speech_standard",
        });
        if (this.client !== client || !this.microphoneAllowed || !this.credential || !credentialCanPublish(this.credential)) {
          track.close(); throw new DOMException("Microphone authorization changed", "AbortError");
        }
        if (!this.microphoneRequestedOn) { track.close(); return false; }
        this.microphoneTrack = track;
        this.observeMicrophone(track);
        const publishing = client.publish(track);
        this.microphoneControlTail = publishing.then(() => undefined, () => undefined);
        try { await publishing; }
        catch (failure) {
          if (this.microphoneTrack === track) this.microphoneTrack = null;
          track.close(); throw failure;
        }
        if (this.client !== client || this.microphoneTrack !== track || !this.microphoneAllowed) {
          await client.unpublish(track).catch(() => undefined);
          if (this.microphoneTrack === track) this.microphoneTrack = null;
          track.close(); throw new DOMException("Microphone authorization changed", "AbortError");
        }
        this.microphonePublished = true;
        track.getMediaStreamTrack().enabled = this.microphoneRequestedOn && this.microphoneAllowed;
        if (!this.microphoneRequestedOn) await track.setMuted(true);
        this.synchronizeMicrophone(track);
      } else {
        const track = this.microphoneTrack;
        // Stop native capture immediately; report "on" only after SDK unmute succeeds.
        track.getMediaStreamTrack().enabled = this.microphoneRequestedOn && this.microphoneAllowed;
        if (!next) this.snapshot.local.microphoneOn = false;
        this.emit();
        const changing = this.microphoneControlTail.then(async () => {
          if (this.microphoneTrack !== track || this.client !== client) throw new DOMException("Microphone replaced", "AbortError");
          await track.setMuted(!next);
          if (this.microphoneTrack === track) {
            track.getMediaStreamTrack().enabled = this.microphoneRequestedOn && this.microphoneAllowed;
            this.synchronizeMicrophone(track);
          }
        });
        this.microphoneControlTail = changing.then(() => undefined, () => undefined);
        await changing;
      }
      return this.snapshot.local.microphoneOn;
    } catch (failure) {
      if (version === this.microphoneControlVersion) {
        this.microphoneRequestedOn = previous && this.microphoneAllowed;
        if (this.microphoneTrack) {
          this.microphoneTrack.getMediaStreamTrack().enabled = previous && this.microphoneAllowed;
          this.synchronizeMicrophone(this.microphoneTrack);
        } else this.snapshot.local.microphoneOn = false;
        this.snapshot.local.microphoneStatus = "failed";
        this.emit();
      }
      throw failure;
    }
  }

  async toggleCamera(): Promise<boolean> {
    if (!this.client || !this.credential) {
      throw new Error("课堂尚未连接");
    }
    if (!credentialCanPublish(this.credential)) {
      throw new Error("学生需要老师邀请上台后才能开启摄像头");
    }
    const client = this.client;
    const rtcUid = String(this.credential.rtcUid);
    const requestedOn = !this.snapshot.local.cameraOn;
    // A mobile/background/device interruption can end an otherwise retained
    // capture. Enabling an ended MediaStreamTrack cannot restart the camera.
    if (this.cameraTrack?.getMediaStreamTrack().readyState === "ended") {
      const expired = this.cameraTrack;
      await client.unpublish(expired).catch(() => undefined);
      if (this.client !== client || this.cameraTrack !== expired) throw new DOMException("Classroom camera changed", "AbortError");
      await this.releaseVirtualBackgroundProcessor();
      expired.close(); this.cameraTrack = null; this.cameraPublished = false;
      if (!requestedOn) {
        this.snapshot.local.cameraOn = false;
        this.upsertParticipant(rtcUid, { hasVideo: false });
        this.clearVideoTargets(rtcUid);
        return false;
      }
    }

    if (!this.cameraTrack) {
      const high = classroomMediaProfile.camera.high;
      // Flexible upper bounds let mobile cameras negotiate a supported size
      // without bypassing the classroom capture limit.
      const touchCamera = window.matchMedia("(pointer: coarse)").matches;
      const cameraOptions = {
        ...(this.preferredCameraId && {
          cameraId: this.preferredCameraId,
        }),
        encoderConfig: {
          width: touchCamera ? { ideal: high.width, max: high.width } : high.width,
          height: touchCamera ? { ideal: high.height, max: high.height } : high.height,
          frameRate: high.frameRate,
          bitrateMin: Math.round(high.bitrateKbps * 0.65),
          bitrateMax: high.bitrateKbps,
        },
        optimizationMode: "balanced" as const,
      };
      let cameraTrack: ICameraVideoTrack;
      try {
        cameraTrack = await AgoraRTC.createCameraVideoTrack(cameraOptions);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!touchCamera || !/NotFound|Overconstrained|DEVICE_NOT_FOUND/i.test(message)) {
          throw error;
        }
        // A remembered device id can become invalid after switching cameras
        // or granting permission. Retry once with the browser's default lens.
        this.preferredCameraId = undefined;
        cameraTrack = await AgoraRTC.createCameraVideoTrack({
          ...cameraOptions, cameraId: undefined,
        });
      }
      if (this.client !== client || !this.credential || !credentialCanPublish(this.credential)) {
        cameraTrack.close();
        throw new DOMException("Classroom left or publication revoked", "AbortError");
      }
      const capturedDeviceId = cameraTrack.getMediaStreamTrack().getSettings().deviceId;
      if (capturedDeviceId && capturedDeviceId === this.snapshot.local.auxiliaryCameraDeviceId && (this.auxiliaryTrack || this.snapshot.local.auxiliaryCameraStarting)) {
        cameraTrack.close();
        throw new Error("主摄像头与辅助摄像头需要选择不同设备");
      }
      this.snapshot.local.cameraDeviceId = capturedDeviceId || this.preferredCameraId;
      this.cameraTrack = cameraTrack;
      try {
        if (this.virtualBackgroundEffect.type !== "none") {
          await this.applyVirtualBackground();
        }
        if (this.client !== client || this.cameraTrack !== cameraTrack) throw new DOMException("Classroom left", "AbortError");
        this.snapshot.local.cameraOn = true;
        this.upsertParticipant(rtcUid, { hasVideo: true });
        this.renderVideoTargets(rtcUid);
        if (!this.portraitCameraSuppressed) {
          await client.publish(cameraTrack);
          if (this.client === client && this.cameraTrack === cameraTrack) this.cameraPublished = true;
        }
      } catch (error) {
        cameraTrack.close();
        if (this.cameraTrack === cameraTrack) {
          await this.releaseVirtualBackgroundProcessor();
          this.cameraTrack = null;
          this.cameraPublished = false;
          this.snapshot.local.cameraOn = false;
          this.upsertParticipant(rtcUid, { hasVideo: false });
          this.clearVideoTargets(rtcUid);
        }
        throw error;
      }
      if (this.client !== client || this.cameraTrack !== cameraTrack) throw new DOMException("Classroom left", "AbortError");
      this.snapshot.local.cameraOn = true;
    } else {
      const next = !this.snapshot.local.cameraOn;
      const track = this.cameraTrack;
      track.getMediaStreamTrack().enabled = next;
      this.snapshot.local.cameraOn = next;
      this.upsertParticipant(String(this.credential.rtcUid), { hasVideo: next });
      if (!next) this.clearVideoTargets(String(this.credential.rtcUid)); else this.renderVideoTargets(String(this.credential.rtcUid));
      try { await track.setMuted(!next); }
      catch (error) { track.getMediaStreamTrack().enabled = !next; this.snapshot.local.cameraOn = !next; this.upsertParticipant(String(this.credential.rtcUid), { hasVideo: !next }); this.renderVideoTargets(String(this.credential.rtcUid)); throw error; }
    }

    if (this.client !== client) throw new DOMException("Classroom left", "AbortError");
    this.upsertParticipant(rtcUid, {
      hasVideo: this.snapshot.local.cameraOn,
    });
    if (this.snapshot.local.cameraOn) {
      this.renderVideoTargets(String(this.credential.rtcUid));
    } else {
      this.clearVideoTargets(String(this.credential.rtcUid));
    }
    await this.syncCameraPublication();
    return this.snapshot.local.cameraOn;
  }

  startAuxiliaryCamera(deviceId: string): Promise<void> {
    if (this.auxiliaryTrack || this.snapshot.local.auxiliaryCameraStarting) return Promise.resolve();
    const task = this.captureAuxiliaryCamera(deviceId);
    this.auxiliaryStartTask = task;
    return task.finally(() => { if (this.auxiliaryStartTask === task) this.auxiliaryStartTask = null; });
  }

  private async captureAuxiliaryCamera(deviceId: string): Promise<void> {
    const credential = this.credential;
    const primary = this.client;
    if (!primary || !credential || !credentialCanPublish(credential) || !credential.auxiliaryCamera) {
      throw new Error("当前没有辅助摄像头发布权限，请先接受上台邀请或恢复摄像头权限");
    }
    if (this.auxiliaryTrack || this.snapshot.local.auxiliaryCameraStarting) return;
    if (!deviceId) throw new Error("请先选择辅助摄像头设备");
    if (this.cameraDeviceBusy) throw new Error("摄像头设备正在切换，请稍后重试");
    if (deviceId === (this.snapshot.local.cameraDeviceId || this.preferredCameraId)) {
      throw new Error("主摄像头与辅助摄像头需要选择不同设备");
    }
    const generation = ++this.auxiliaryGeneration;
    const identity = credential.auxiliaryCamera;
    const current = () => generation === this.auxiliaryGeneration && this.client === primary &&
      this.credential?.auxiliaryCamera?.rtcUid === identity.rtcUid && credentialCanPublish(this.credential);
    this.snapshot.local.auxiliaryCameraDeviceId = deviceId;
    this.snapshot.local.auxiliaryCameraStarting = true;
    this.emit();
    let track: ICameraVideoTrack | null = null;
    let client: IAgoraRTCClient | null = null;
    try {
      const high = classroomMediaProfile.camera.high;
      // Capture on the initiating click; join and publication follow asynchronously.
      track = await AgoraRTC.createCameraVideoTrack({
        cameraId: deviceId,
        encoderConfig: { width: high.width, height: high.height, frameRate: high.frameRate,
          bitrateMin: Math.round(high.bitrateKbps * 0.65), bitrateMax: high.bitrateKbps },
        optimizationMode: "detail",
      });
      if (!current()) { track.close(); return; }
      const capturedId = track.getMediaStreamTrack().getSettings().deviceId || deviceId;
      if (capturedId === (this.snapshot.local.cameraDeviceId || this.preferredCameraId)) {
        throw new Error("主摄像头与辅助摄像头需要选择不同设备");
      }
      this.auxiliaryPendingTrack = track;
      await this.auxiliaryTeardown;
      if (!current()) { track.close(); return; }
      client = AgoraRTC.createClient({ mode: credential.scenario === "liveBroadcasting" ? "live" : "rtc",
        codec: "vp8", ...(credential.scenario === "liveBroadcasting" && { role: "host" as const }) });
      this.auxiliaryTrack = track;
      this.auxiliaryPendingTrack = null;
      this.auxiliaryClient = client;
      this.snapshot.local.auxiliaryCameraDeviceId = capturedId;
      this.watchTokenExpiry(client);
      const capturedTrack = track;
      track.on("track-ended", () => { if (this.auxiliaryTrack === capturedTrack) void this.stopAuxiliaryCamera(); });
      await client.join(credential.appId, credential.channelName, this.credential!.auxiliaryCamera!.token, identity.rtcUid);
      if (!current()) { await client.leave().catch(() => undefined); track.close(); return; }
      const low = classroomMediaProfile.camera.low;
      client.setLowStreamParameter({ width: low.width, height: low.height, framerate: low.frameRate, bitrate: low.bitrateKbps });
      void client.enableDualStream().catch((error: unknown) => {
        console.warn("[ClassroomRTC] Failed to enable auxiliary dual stream", error);
      });
      await client.publish(track);
      if (!current()) { await client.unpublish(track).catch(() => undefined); await client.leave().catch(() => undefined); track.close(); return; }
      this.snapshot.local.auxiliaryCameraOn = true;
      this.snapshot.local.auxiliaryCameraStarting = false;
      this.upsertParticipant(String(identity.rtcUid), { isLocal: true, kind: "auxiliary-camera", hasVideo: true, hasAudio: false });
      this.renderVideoTargets(String(identity.rtcUid));
    } catch (error) {
      track?.close();
      if (this.auxiliaryTrack === track) this.auxiliaryTrack = null;
      if (this.auxiliaryClient === client) this.auxiliaryClient = null;
      client?.removeAllListeners();
      await client?.leave().catch(() => undefined);
      if (current()) {
        this.snapshot.local.auxiliaryCameraOn = false;
        this.snapshot.local.auxiliaryCameraStarting = false;
        this.removeParticipant(String(identity.rtcUid));
        throw error;
      }
    } finally {
      if (this.auxiliaryPendingTrack === track) this.auxiliaryPendingTrack = null;
    }
  }

  async stopAuxiliaryCamera(): Promise<void> {
    ++this.auxiliaryGeneration;
    const track = this.auxiliaryTrack;
    const pendingTrack = this.auxiliaryPendingTrack;
    const client = this.auxiliaryClient;
    const id = this.auxiliaryId();
    this.auxiliaryTrack = null;
    this.auxiliaryPendingTrack = null;
    this.auxiliaryClient = null;
    this.snapshot.local.auxiliaryCameraOn = false;
    this.snapshot.local.auxiliaryCameraStarting = false;
    // Release capture immediately, including on permission revocation or unplug.
    if (track) { track.getMediaStreamTrack().enabled = false; track.close(); }
    if (pendingTrack && pendingTrack !== track) { pendingTrack.getMediaStreamTrack().enabled = false; pendingTrack.close(); }
    if (id) this.removeParticipant(id); else this.emit();
    const previous = this.auxiliaryTeardown;
    const pending = this.auxiliaryStartTask;
    const stopping = (async () => {
      client?.removeAllListeners();
      if (track && client) await client.unpublish(track).catch(() => undefined);
      await client?.leave().catch(() => undefined);
    })();
    // A cancelled browser permission prompt cannot be aborted by the SDK.
    // Release now, and serialize the next join behind its eventual cleanup.
    this.auxiliaryTeardown = Promise.all([previous, pending?.catch(() => undefined), stopping]).then(() => undefined);
    await stopping;
  }

  async setAuxiliaryCameraDevice(deviceId: string): Promise<void> {
    if (!deviceId) return;
    if (this.cameraDeviceBusy) throw new Error("摄像头设备正在切换，请稍后重试");
    if (this.snapshot.local.auxiliaryCameraStarting) throw new Error("辅助摄像头正在开启，请稍后切换设备");
    if (deviceId === (this.snapshot.local.cameraDeviceId || this.preferredCameraId)) {
      throw new Error("主摄像头与辅助摄像头需要选择不同设备");
    }
    this.cameraDeviceBusy = true;
    try {
      if (this.auxiliaryTrack) await this.auxiliaryTrack.setDevice(deviceId);
      this.snapshot.local.auxiliaryCameraDeviceId = deviceId;
      if (this.auxiliaryTrack) this.renderVideoTargets(this.auxiliaryId()!);
      this.emit();
    } finally { this.cameraDeviceBusy = false; }
  }

  supportsSharePortrait() { return supportsSharePortrait(); }

  private syncCameraPublication(): Promise<void> {
    const task = this.cameraPublicationQueue.catch(() => undefined).then(async () => {
      const client = this.client, track = this.cameraTrack;
      if (!client || !track || !this.credential || !credentialCanPublish(this.credential)) return;
      if (client.connectionState !== "CONNECTED") {
        if (client.connectionState === "DISCONNECTED") this.cameraPublished = false;
        return;
      }
      if ((this.portraitCameraSuppressed || !this.snapshot.local.cameraOn) && this.cameraPublished) {
        await client.unpublish(track);
        if (this.client === client && this.cameraTrack === track) this.cameraPublished = false;
      } else if (!this.portraitCameraSuppressed && !this.cameraPublished && this.snapshot.local.cameraOn) {
        await client.publish(track);
        if (this.client === client && this.cameraTrack === track) this.cameraPublished = true;
      }
    });
    this.cameraPublicationQueue = task;
    return task;
  }

  setScreenShareOptions(options: ClassroomScreenShareOptions): Promise<void> {
    options = normalizeScreenShareOptions(options);
    const version = this.screenStartVersion;
    const task = this.screenOptionsQueue.catch(() => undefined).then(async () => {
      if (version !== this.screenStartVersion || !this.snapshot.local.screenSharing || !this.screenClient || !this.screenCaptureTrack || !this.screenTrack) return;
      if (!this.client) throw new Error("课堂尚未连接");
    if (options.mode === "portrait" && !this.supportsSharePortrait()) throw new Error("共享＋人像需要桌面 Chrome 或 Edge");
      const client = this.screenClient, capture = this.screenCaptureTrack;
      const active = () => version === this.screenStartVersion && this.screenClient === client;
      const previous = { mode: this.snapshot.local.screenShareMode ?? "screen", corner: this.snapshot.local.screenShareCorner };
      try {
        if (!this.sharePortrait && options.mode === "portrait") {
          await capture.getMediaStreamTrack().applyConstraints?.({ width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 15, max: 15 } });
          if (!active()) return;
          const composite = await createSharePortrait(capture.getMediaStreamTrack(), () => this.snapshot.local.cameraOn ? this.cameraTrack?.getMediaStreamTrack() ?? null : null, options);
          if (!active()) { composite.dispose(); return; }
          this.sharePortrait = composite;
          this.portraitCameraSuppressed = true;
          await this.syncCameraPublication();
          if (!active()) return;
          await client.unpublish(this.screenTrack);
          if (!active()) return;
          this.screenTrack = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: composite.track, width: 1920, height: 1080, frameRate: 15, optimizationMode: "detail" });
          await this.screenTrack.setEncoderConfiguration(screenShareProfile("portrait"));
          if (!active()) return;
          await client.publish(this.screenTrack);
        } else if (this.sharePortrait) {
          if (options.mode === "portrait") { this.portraitCameraSuppressed = true; await this.syncCameraPublication(); }
          if (!active()) return;
          const changedMode = options.mode !== previous.mode;
          if (changedMode) await client.unpublish(this.screenTrack);
          if (!active()) return;
          this.sharePortrait.setOptions(options);
          if (changedMode) await this.screenTrack.setEncoderConfiguration(screenShareProfile(options.mode));
          if (!active()) return;
          if (changedMode) await client.publish(this.screenTrack);
        }
        if (!active()) return;
        this.snapshot.local.screenShareMode = options.mode;
        this.snapshot.local.screenShareCorner = options.corner ?? "br";
        this.snapshot.local.screenShareOptions = { ...options };
        this.portraitCameraSuppressed = options.mode === "portrait";
        await this.syncCameraPublication();
        this.emit();
      } catch (error) {
        // Failed reconfiguration cannot leave a half-published composite or a
        // suppressed camera behind. Stop through the normal owned lifecycle.
        if (active()) await this.stopScreenShare();
        console.warn("[classroom:rtc] screen layout update failed", previous, error);
        throw error;
      }
    });
    this.screenOptionsQueue = task;
    return task;
  }

  async startScreenShare(authorize?: () => Promise<void>, options: ClassroomScreenShareOptions = { mode: "screen" }): Promise<void> {
    options = normalizeScreenShareOptions(options);
    if (options.mode === "portrait" && !this.supportsSharePortrait()) throw new Error("共享＋人像需要桌面 Chrome 或 Edge");
    if (!this.credential?.screenShare) {
      throw new Error("当前角色不能共享屏幕");
    }
    if (this.screenTrack || this.screenClient) return;
    const version = ++this.screenStartVersion;
    const primaryClient = this.client;

    // Keep this as the first awaited browser operation. getDisplayMedia must
    // stay inside the user's click activation or browsers silently block it.
    const screen = options.mode === "portrait" ? { ...screenShareProfile("portrait"), bitrateKbps: 2600, optimizationMode: "detail" as const } : classroomMediaProfile.screen;
    const capturedTracks = await AgoraRTC.createScreenVideoTrack(
      {
        encoderConfig: {
          width: screen.width,
          height: screen.height,
          frameRate: screen.frameRate,
          bitrateMin: Math.round(screen.bitrateKbps * 0.65),
          bitrateMax: screen.bitrateKbps,
        },
        optimizationMode: screen.optimizationMode,
      },
      "auto",
    );
    const [screenTrack, screenAudioTrack] = Array.isArray(capturedTracks)
      ? capturedTracks
      : [capturedTracks, null];
    if (version !== this.screenStartVersion || this.client !== primaryClient) {
      screenTrack.close();
      screenAudioTrack?.close();
      throw new DOMException("Screen sharing canceled", "AbortError");
    }
    this.screenCaptureTrack = screenTrack;
    this.screenTrack = screenTrack;
    this.screenAudioTrack = screenAudioTrack;

    const screenClient = AgoraRTC.createClient({
      mode:
        this.credential.scenario === "liveBroadcasting" ? "live" : "rtc",
      codec: "vp8",
      ...(this.credential.scenario === "liveBroadcasting" && {
        role: "host" as const,
      }),
    });
    this.screenClient = screenClient;
    this.watchTokenExpiry(screenClient);
    screenTrack.on("track-ended", () => {
      if (this.screenCaptureTrack === screenTrack) void this.stopScreenShare().catch(error => console.warn("[classroom:rtc] camera restoration deferred after capture ended", error));
    });

    try {
      // Capture first to preserve browser activation. Claim the classroom's
      // publisher slot only after the user actually chooses a screen.
      await authorize?.();
      const assertActive = () => {
        if (version !== this.screenStartVersion || this.screenClient !== screenClient || this.client !== primaryClient) {
          throw new DOMException("Screen sharing canceled", "AbortError");
        }
      };
      assertActive();
      await screenClient.join(
        this.credential.appId,
        this.credential.channelName,
        this.credential.screenShare.token,
        this.credential.screenShare.rtcUid,
      );
      assertActive();
      if (options.mode === "portrait") {
        const composite = await createSharePortrait(screenTrack.getMediaStreamTrack(), () => this.snapshot.local.cameraOn ? this.cameraTrack?.getMediaStreamTrack() ?? null : null, options);
        try { assertActive(); } catch (error) { composite.dispose(); throw error; }
        this.sharePortrait = composite;
        this.screenTrack = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: composite.track, width: 1920, height: 1080, frameRate: 15, optimizationMode: "detail" });
        await this.screenTrack.setEncoderConfiguration(screenShareProfile("portrait"));
        assertActive();
        this.portraitCameraSuppressed = true;
        await this.syncCameraPublication();
        assertActive();
      }
      const output = this.screenTrack!;
      await screenClient.publish(screenAudioTrack ? [output, screenAudioTrack] : output);
      assertActive();
      this.snapshot.local.screenSharing = true;
      this.snapshot.local.screenShareMode = options.mode;
      this.snapshot.local.screenShareCorner = options.corner ?? "br";
      this.snapshot.local.screenShareOptions = { ...options };
      this.upsertParticipant(String(this.credential.screenShare.rtcUid), {
        displayName: `${this.displayName} · 屏幕`,
        isLocal: true,
        kind: "screen",
        hasVideo: true,
        hasAudio: Boolean(screenAudioTrack),
      });
      await this.focusParticipant(String(this.credential.screenShare.rtcUid));
    } catch (error) {
      if (this.screenClient === screenClient) await this.stopScreenShare();
      else { screenTrack.close(); screenAudioTrack?.close(); await screenClient.leave().catch(() => undefined); }
      throw error;
    }
  }

  async stopScreenShare(): Promise<void> {
    ++this.screenStartVersion;
    const screenId = this.screenId();
    const track = this.screenTrack;
    const capture = this.screenCaptureTrack;
    const composite = this.sharePortrait;
    const audioTrack = this.screenAudioTrack;
    const client = this.screenClient;
    if (!track && !client && !this.snapshot.local.screenSharing) return;

    this.screenCaptureTrack = null;
    this.sharePortrait = null;
    this.screenTrack = null;
    this.screenAudioTrack = null;
    this.screenClient = null;
    this.snapshot.local.screenSharing = false;
    this.snapshot.local.screenShareMode = undefined;
    this.snapshot.local.screenShareCorner = undefined;
    this.snapshot.local.screenShareOptions = undefined;
    this.portraitCameraSuppressed = false;
    composite?.dispose();
    if (capture && capture !== track) capture.close();
    // Stop sending content immediately, before network unpublish completes.
    if (track) track.getMediaStreamTrack().enabled = false;
    if (audioTrack) audioTrack.getMediaStreamTrack().enabled = false;

    // Reflect the user's second click before the Agora teardown finishes.
    // Unpublishing and leaving the secondary screen-share client can take a
    // noticeable amount of time; keeping the screen participant mounted until
    // then makes the button look like it did not stop the share.
    if (screenId) {
      this.removeParticipant(screenId);
    } else {
      this.emit();
    }

    if (client && track) {
      await client.unpublish(audioTrack ? [track, audioTrack] : track).catch(() => undefined);
    }
    track?.close();
    audioTrack?.close();
    await client?.leave().catch(() => undefined);
    await this.syncCameraPublication();
  }

  async focusParticipant(participantIdToFocus: string | null): Promise<void> {
    this.snapshot.focusedParticipantId = participantIdToFocus;
    await this.updateRemoteVideos();
    this.emit();
  }

  attachVideo(id: string, element: HTMLElement): void {
    const previousId = this.videoTargetOwners.get(element);
    if (previousId && previousId !== id) this.detachVideo(previousId, element);
    this.videoTargetOwners.set(element, id);
    const targets = this.videoElements.get(id) ?? new Set<HTMLElement>();
    targets.add(element);
    this.videoElements.set(id, targets);
    this.renderVideoTarget(id, element);
    if (!this.videoTargetObservers.has(element) && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => { void this.updateRemoteVideos(); });
      observer.observe(element);
      this.videoTargetObservers.set(element, observer);
    }
    void this.updateRemoteVideos();
  }

  detachVideo(id: string, element: HTMLElement): void {
    if (this.videoTargetOwners.get(element) !== id) return;
    this.videoTargetOwners.delete(element);
    this.clearVideoTarget(element);
    this.videoTargetObservers.get(element)?.disconnect();
    this.videoTargetObservers.delete(element);
    const targets = this.videoElements.get(id);
    targets?.delete(element);
    if (targets?.size === 0) this.videoElements.delete(id);
    void this.updateRemoteVideos();
  }

  async renewToken(token: string): Promise<void> {
    if (!this.client) throw new Error("课堂尚未连接");
    await this.client.renewToken(token);
  }

  renewCredential(credential: ClassroomJoinCredential): Promise<void> {
    return this.serializeRecovery(() => this.renewCredentialNow(credential));
  }

  private async renewCredentialNow(credential: ClassroomJoinCredential): Promise<void> {
    if (!this.client || !this.credential) {
      throw new Error("课堂尚未连接");
    }
    if (
      credential.channelName !== this.credential.channelName ||
      credential.userId !== this.credential.userId ||
      credential.rtcUid !== this.credential.rtcUid
    ) {
      throw new RangeError("续期凭证与当前课堂不匹配");
    }
    const client = this.client;
    if (!credentialCanPublish(credential) && credentialCanPublish(this.credential)) {
      await this.setPublishingCredential(null);
      if (this.client !== client) throw new DOMException("Classroom left", "AbortError");
    }
    const tracks = [this.portraitCameraSuppressed || !this.snapshot.local.cameraOn ? null : this.cameraTrack, this.microphoneTrack].filter((track): track is ICameraVideoTrack | IMicrophoneAudioTrack => Boolean(track && track.getMediaStreamTrack().readyState !== "ended"));
    const rejoining = client.connectionState === "DISCONNECTED" || this.expiredClients.has(client);
    await renewAgoraConnection(client, credential, tracks, () => this.client === client, this.expiredClients.has(client));
    if (rejoining) this.cameraPublished = Boolean(this.cameraTrack && tracks.includes(this.cameraTrack));
    this.expiredClients.delete(client);
    // Retain the fresh primary token even if a secondary publisher fails.
    this.credential = { ...this.credential, token: credential.token, expiresInSeconds: credential.expiresInSeconds };
    if (this.screenClient && !credential.screenShare) await this.stopScreenShare();
    if (this.screenClient && this.snapshot.local.screenSharing) {
      if (
        !credential.screenShare ||
        credential.screenShare.rtcUid !== this.credential.screenShare?.rtcUid
      ) {
        throw new RangeError("共享屏幕续期凭证与当前课堂不匹配");
      }
      const screenClient = this.screenClient;
      const screenTracks = [this.screenTrack, this.screenAudioTrack].filter((track): track is ILocalVideoTrack | ILocalAudioTrack => Boolean(track));
      await renewAgoraConnection(screenClient, { ...credential, ...credential.screenShare }, screenTracks, () => this.screenClient === screenClient && this.client === client, this.expiredClients.has(screenClient));
      this.expiredClients.delete(screenClient);
    }
    if (!credentialCanPublish(credential) || !credential.auxiliaryCamera) {
      const stopping = this.stopAuxiliaryCamera();
      this.credential = { ...this.credential, auxiliaryCamera: undefined };
      await stopping;
    } else if (this.auxiliaryClient) {
      if (credential.auxiliaryCamera.rtcUid !== this.credential.auxiliaryCamera?.rtcUid) {
        throw new RangeError("辅助摄像头续期凭证与当前课堂不匹配");
      }
      const auxiliaryClient = this.auxiliaryClient;
      await renewAgoraConnection(auxiliaryClient, { ...credential, ...credential.auxiliaryCamera }, this.auxiliaryTrack ? [this.auxiliaryTrack] : [], () => this.auxiliaryClient === auxiliaryClient && this.client === client, this.expiredClients.has(auxiliaryClient));
      this.expiredClients.delete(auxiliaryClient);
    }
    if (this.client !== client) throw new DOMException("Classroom left", "AbortError");
    this.credential = { ...this.credential, ...credential, auxiliaryCamera: credential.auxiliaryCamera };
  }

  async listDevices(): Promise<{
    microphones: MediaDeviceInfo[];
    cameras: MediaDeviceInfo[];
  }> {
    const [microphones, cameras] = await Promise.all([
      AgoraRTC.getMicrophones(true),
      AgoraRTC.getCameras(true),
    ]);
    return { microphones, cameras };
  }

  async setMicrophoneDevice(deviceId: string): Promise<void> {
    if (!deviceId) return;
    const track = this.microphoneTrack;
    if (track) {
      await track.setDevice(deviceId);
      if (this.microphoneTrack !== track) throw new DOMException("Microphone replaced", "AbortError");
      track.getMediaStreamTrack().enabled = this.microphoneRequestedOn && this.microphoneAllowed;
      this.observeMicrophone(track);
      this.synchronizeMicrophone(track);
    }
    this.preferredMicrophoneId = deviceId;
  }

  async setCameraDevice(deviceId: string): Promise<void> {
    if (!deviceId) return;
    if (this.cameraDeviceBusy) throw new Error("摄像头设备正在切换，请稍后重试");
    if ((this.auxiliaryTrack || this.snapshot.local.auxiliaryCameraStarting) && deviceId === this.snapshot.local.auxiliaryCameraDeviceId) {
      throw new Error("主摄像头与辅助摄像头需要选择不同设备");
    }
    this.cameraDeviceBusy = true;
    try {
      if (this.cameraTrack) await this.cameraTrack.setDevice(deviceId);
      this.preferredCameraId = deviceId;
      this.snapshot.local.cameraDeviceId = deviceId;
      if (this.cameraTrack) this.renderVideoTargets(this.cameraId()!);
      this.emit();
    } finally { this.cameraDeviceBusy = false; }
  }

  supportsVirtualBackground(): boolean {
    try {
      return virtualBackgroundExtension.checkCompatibility();
    } catch {
      return false;
    }
  }

  private async ensureVirtualBackgroundProcessor() {
    if (!this.cameraTrack) return null;
    if (this.virtualBackgroundProcessor) {
      return this.virtualBackgroundProcessor;
    }
    if (!this.supportsVirtualBackground()) {
      throw new Error("当前浏览器或设备不支持虚拟背景");
    }
    const processor = virtualBackgroundExtension.createProcessor();
    await processor.init();
    this.cameraTrack.pipe(processor).pipe(this.cameraTrack.processorDestination);
    this.virtualBackgroundProcessor = processor;
    return processor;
  }

  private async applyVirtualBackground() {
    if (!this.cameraTrack) return;
    if (this.virtualBackgroundEffect.type === "none") {
      await this.virtualBackgroundProcessor?.disable();
      return;
    }
    const processor = await this.ensureVirtualBackgroundProcessor();
    if (!processor) return;
    switch (this.virtualBackgroundEffect.type) {
      case "blur":
        processor.setOptions({
          type: "blur",
          blurDegree: this.virtualBackgroundEffect.blurDegree,
        });
        break;
      case "color":
        processor.setOptions({
          type: "color",
          color: this.virtualBackgroundEffect.color,
        });
        break;
      case "image":
        processor.setOptions({
          type: "img",
          source: this.virtualBackgroundEffect.source,
          fit: "cover",
        });
        break;
    }
    await processor.enable();
  }

  async setVirtualBackground(
    effect: ClassroomVideoBackgroundEffect,
  ): Promise<void> {
    if (effect.type !== "none" && !this.supportsVirtualBackground()) {
      throw new Error("当前浏览器或设备不支持虚拟背景");
    }
    const previousEffect = this.virtualBackgroundEffect;
    this.virtualBackgroundEffect = effect;
    try {
      await this.applyVirtualBackground();
    } catch (error) {
      this.virtualBackgroundEffect = previousEffect;
      if (this.cameraTrack && this.snapshot.local.cameraOn) {
        await this.cameraTrack.setMuted(true).catch(() => undefined);
        this.snapshot.local.cameraOn = false;
        if (this.credential) {
          this.upsertParticipant(String(this.credential.rtcUid), { hasVideo: false });
          this.clearVideoTargets(String(this.credential.rtcUid));
        } else {
          this.emit();
        }
      }
      throw error;
    }
  }

  private async releaseVirtualBackgroundProcessor() {
    const processor = this.virtualBackgroundProcessor;
    this.virtualBackgroundProcessor = null;
    if (!processor) return;
    this.cameraTrack?.unpipe();
    processor.unpipe();
    await Promise.resolve(processor.disable()).catch(() => undefined);
    await processor.release().catch(() => undefined);
  }

  async setPublishingCredential(
    credential: ClassroomJoinCredential | null,
  ): Promise<void> {
    if (!this.client || !this.credential) {
      throw new Error("课堂尚未连接");
    }

    if (credential) {
      if (
        credential.channelName !== this.credential.channelName ||
        credential.userId !== this.credential.userId ||
        credential.rtcUid !== this.credential.rtcUid
      ) {
        throw new Error("发布凭证与当前课堂不匹配");
      }
      await this.renewCredential(credential);
      if (credential.scenario === "liveBroadcasting") {
        await this.client.setClientRole("host");
      }
      this.credential = {
        ...this.credential,
        ...credential,
        publishAllowed: true,
      };
      return;
    }

    const auxiliaryStopping = this.stopAuxiliaryCamera();
    this.credential = { ...this.credential, publishAllowed: false, auxiliaryCamera: undefined };
    const localTracks = [this.microphoneTrack, this.cameraTrack].filter(
      (track): track is IMicrophoneAudioTrack | ICameraVideoTrack =>
        Boolean(track),
    );
    if (localTracks.length > 0) {
      await this.client.unpublish(localTracks).catch(() => undefined);
    }
    await this.releaseVirtualBackgroundProcessor();
    this.microphoneTrack?.close();
    this.cameraTrack?.close();
    this.microphoneTrack = null;
    this.cameraTrack = null;
    this.cameraPublished = false;
    this.microphoneRequestedOn = false;
    this.microphonePublished = false;
    this.snapshot.local.microphoneOn = false;
    this.snapshot.local.microphoneStatus = "off";
    this.snapshot.local.cameraOn = false;
    this.upsertParticipant(String(this.credential.rtcUid), {
      hasAudio: false,
      hasVideo: false,
    });
    await auxiliaryStopping;
    await this.stopScreenShare();
    if (this.credential.scenario === "liveBroadcasting") {
      await this.client.setClientRole("audience");
    }
    this.credential = {
      ...this.credential,
      publishAllowed: false,
      screenShare: undefined,
    };
  }

  async disconnect(): Promise<void> {
    this.microphoneOperation = null;
    this.microphoneToggleTail = Promise.resolve();
    this.microphoneControlTail = Promise.resolve();
    this.connectionGeneration++;
    ++this.microphoneControlVersion;
    this.microphoneRequestedOn = false;
    this.microphonePublished = false;
    const client = this.client;
    this.client = null;
    for (const observer of this.videoTargetObservers.values()) observer.disconnect();
    this.videoTargetObservers.clear();
    this.remoteVideoStreamTypes.clear();
    this.remoteObservedPixels.clear();
    this.remoteVideoUpdate = Promise.resolve();
    this.remoteVideoUpdateScheduled = false;
    const auxiliaryStopping = this.stopAuxiliaryCamera();
    if (this.credential) this.credential = { ...this.credential, auxiliaryCamera: undefined };
    await this.stopScreenShare();
    await auxiliaryStopping;
    if (client) {
      const localTracks = [
        this.microphoneTrack,
        this.cameraTrack,
      ].filter(
        (track): track is IMicrophoneAudioTrack | ICameraVideoTrack =>
          Boolean(track),
      );
      if (localTracks.length > 0) {
        await client.unpublish(localTracks).catch(() => undefined);
      }
      await client.leave().catch(() => undefined);
      client.removeAllListeners();
    }
    await this.releaseVirtualBackgroundProcessor();
    this.microphoneTrack?.close();
    this.cameraTrack?.close();
    this.microphoneTrack = null;
    this.cameraTrack = null;
    this.cameraPublished = false;
    this.remoteUsers.clear();
    this.participants.clear();
    for (const id of this.videoElements.keys()) this.clearVideoTargets(id);
    this.videoElements.clear();
    this.tokenExpiryListeners.clear();
    this.credential = null;
    this.preferredMicrophoneId = undefined;
    this.preferredCameraId = undefined;
    this.virtualBackgroundEffect = { type: "none" };
    this.snapshot = {
      connectionState: "disconnected",
      participants: [],
      network: {
        uplinkQuality: 0,
        downlinkQuality: 0,
        latencyMs: null,
        packetLossPercent: null,
      },
      local: {
        microphoneOn: false,
        cameraOn: false,
        screenSharing: false,
      },
      focusedParticipantId: null,
    };
    this.emit();
  }
}
