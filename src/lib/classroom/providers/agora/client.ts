"use client";

import AgoraRTC, {
  type IAgoraRTCClient,
  type IAgoraRTCRemoteUser,
  type ICameraVideoTrack,
  type ILocalVideoTrack,
  type IMicrophoneAudioTrack,
  type UID,
} from "agora-rtc-sdk-ng";
import {
  classroomMediaProfile,
  classroomVideoPresets,
} from "@/lib/classroom/config";
import { isScreenShareUserId } from "@/lib/classroom/screen-share";
import { decodeClassroomSttCaption } from "@/lib/classroom/stt-caption";
import {
  credentialCanPublish,
  type ClassroomConnectionState,
  type ClassroomCaptionListener,
  type ClassroomJoinCredential,
  type ClassroomMediaListener,
  type ClassroomMediaProvider,
  type ClassroomMediaSnapshot,
  type ClassroomParticipant,
} from "@/lib/classroom/types";

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
  private screenClient: IAgoraRTCClient | null = null;
  private credential: ClassroomJoinCredential | null = null;
  private displayName = "";
  private microphoneTrack: IMicrophoneAudioTrack | null = null;
  private cameraTrack: ICameraVideoTrack | null = null;
  private screenTrack: ILocalVideoTrack | null = null;
  private preferredMicrophoneId: string | undefined;
  private preferredCameraId: string | undefined;
  private remoteUsers = new Map<string, IAgoraRTCRemoteUser>();
  private participants = new Map<string, ClassroomParticipant>();
  private videoElements = new Map<string, Set<HTMLElement>>();
  private listeners = new Set<ClassroomMediaListener>();
  private captionListeners = new Set<ClassroomCaptionListener>();
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
      videoQuality: "hd",
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

  private emit() {
    this.snapshot = {
      ...this.snapshot,
      participants: Array.from(this.participants.values()).sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "screen" ? -1 : 1;
        if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      }),
    };
    const current = this.getSnapshot();
    for (const listener of this.listeners) listener(current);
  }

  private isLocalParticipant(id: string) {
    return (
      id === this.credential?.userId ||
      id === this.credential?.screenShare?.userId
    );
  }

  private displayNameFor(id: string) {
    if (id === this.credential?.userId) return this.displayName;
    if (id === this.credential?.screenShare?.userId) {
      return `${this.displayName} · 屏幕`;
    }
    return isScreenShareUserId(id) ? "共享屏幕" : id;
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
      kind: isScreenShareUserId(id) ? "screen" : "camera",
      hasAudio: existing?.hasAudio ?? false,
      hasVideo: existing?.hasVideo ?? false,
      ...existing,
      ...update,
    });
    this.emit();
  }

  private mediaStreamTrackFor(id: string): MediaStreamTrack | null {
    if (id === this.credential?.userId) {
      return this.cameraTrack?.getMediaStreamTrack() ?? null;
    }
    if (id === this.credential?.screenShare?.userId) {
      return this.screenTrack?.getMediaStreamTrack() ?? null;
    }
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
    this.clearVideoTarget(element);
    const track = this.mediaStreamTrackFor(id);
    if (!track || track.readyState === "ended") return;

    const video = document.createElement("video");
    video.className = "classroom-v3-native-video";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.dataset.fit = isScreenShareUserId(id) ? "contain" : "cover";
    video.dataset.mirror =
      id === this.credential?.userId && !isScreenShareUserId(id)
        ? "true"
        : "false";
    video.srcObject = new MediaStream([track]);
    element.appendChild(video);
    void video.play().catch(() => undefined);
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

  private removeParticipant(id: string) {
    this.remoteUsers.delete(id);
    this.participants.delete(id);
    this.clearVideoTargets(id);
    this.videoElements.delete(id);
    if (this.snapshot.focusedParticipantId === id) {
      this.snapshot.focusedParticipantId = null;
    }
    this.emit();
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

    client.on("connection-state-change", (state) => {
      this.snapshot.connectionState = connectionState(state);
      this.emit();
    });
    client.on("network-quality", (quality) => {
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
      const id = participantId(user.uid);
      this.remoteUsers.set(id, user);
      this.upsertParticipant(id);
    });
    client.on("user-left", (user) => {
      this.removeParticipant(participantId(user.uid));
    });
    client.on("user-published", (user, mediaType) => {
      void this.onUserPublished(user, mediaType);
    });
    client.on("user-unpublished", (user, mediaType) => {
      const id = participantId(user.uid);
      this.upsertParticipant(id, {
        ...(mediaType === "audio" ? { hasAudio: false } : {}),
        ...(mediaType === "video" ? { hasVideo: false } : {}),
      });
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
      credential.userId,
    );

    this.upsertParticipant(credential.userId, {
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
    const id = participantId(user.uid);
    this.remoteUsers.set(id, user);

    // The primary client receives the separate local screen publisher too.
    // Render the local capture directly instead of subscribing to ourselves.
    if (id === this.credential?.screenShare?.userId) {
      this.upsertParticipant(id, {
        isLocal: true,
        hasVideo: mediaType === "video",
      });
      return;
    }

    await this.client.subscribe(user, mediaType);
    if (mediaType === "audio" && user.audioTrack) {
      user.audioTrack.play();
      this.upsertParticipant(id, { hasAudio: true });
      return;
    }

    if (mediaType === "video") {
      await this.client
        .setRemoteVideoStreamType(
          user.uid,
          isScreenShareUserId(id) ||
            this.snapshot.focusedParticipantId === id
            ? 0
            : 1,
        )
        .catch(() => undefined);
      this.upsertParticipant(id, { hasVideo: true });
      this.renderVideoTargets(id);
    }
  }

  async toggleMicrophone(): Promise<boolean> {
    if (!this.client || !this.credential) {
      throw new Error("课堂尚未连接");
    }
    if (!credentialCanPublish(this.credential)) {
      throw new Error("学生需要老师邀请上台后才能发言");
    }

    if (!this.microphoneTrack) {
      this.microphoneTrack = await AgoraRTC.createMicrophoneAudioTrack({
        ...(this.preferredMicrophoneId && {
          microphoneId: this.preferredMicrophoneId,
        }),
        AEC: true,
        AGC: true,
        ANS: true,
        encoderConfig: "speech_standard",
      });
      await this.client.publish(this.microphoneTrack);
      this.snapshot.local.microphoneOn = true;
    } else {
      const next = !this.snapshot.local.microphoneOn;
      await this.microphoneTrack.setMuted(!next);
      this.snapshot.local.microphoneOn = next;
    }

    this.upsertParticipant(this.credential.userId, {
      hasAudio: this.snapshot.local.microphoneOn,
    });
    return this.snapshot.local.microphoneOn;
  }

  async toggleCamera(): Promise<boolean> {
    if (!this.client || !this.credential) {
      throw new Error("课堂尚未连接");
    }
    if (!credentialCanPublish(this.credential)) {
      throw new Error("学生需要老师邀请上台后才能开启摄像头");
    }

    if (!this.cameraTrack) {
      const high =
        classroomVideoPresets[this.snapshot.local.videoQuality].camera.high;
      this.cameraTrack = await AgoraRTC.createCameraVideoTrack({
        ...(this.preferredCameraId && {
          cameraId: this.preferredCameraId,
        }),
        encoderConfig: {
          width: high.width,
          height: high.height,
          frameRate: high.frameRate,
          bitrateMin: Math.round(high.bitrateKbps * 0.65),
          bitrateMax: high.bitrateKbps,
        },
        optimizationMode: "balanced",
      });
      await this.client.publish(this.cameraTrack);
      this.snapshot.local.cameraOn = true;
    } else {
      const next = !this.snapshot.local.cameraOn;
      await this.cameraTrack.setMuted(!next);
      this.snapshot.local.cameraOn = next;
    }

    this.upsertParticipant(this.credential.userId, {
      hasVideo: this.snapshot.local.cameraOn,
    });
    if (this.snapshot.local.cameraOn) {
      this.renderVideoTargets(this.credential.userId);
    } else {
      this.clearVideoTargets(this.credential.userId);
    }
    return this.snapshot.local.cameraOn;
  }

  async startScreenShare(): Promise<void> {
    if (!this.credential?.screenShare) {
      throw new Error("当前角色不能共享屏幕");
    }
    if (this.screenTrack || this.screenClient) return;

    // Keep this as the first awaited browser operation. getDisplayMedia must
    // stay inside the user's click activation or browsers silently block it.
    const screen = classroomMediaProfile.screen;
    const screenTrack = await AgoraRTC.createScreenVideoTrack(
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
      "disable",
    );
    this.screenTrack = screenTrack;

    const screenClient = AgoraRTC.createClient({
      mode:
        this.credential.scenario === "liveBroadcasting" ? "live" : "rtc",
      codec: "vp8",
      ...(this.credential.scenario === "liveBroadcasting" && {
        role: "host" as const,
      }),
    });
    this.screenClient = screenClient;
    screenTrack.on("track-ended", () => {
      void this.stopScreenShare();
    });

    try {
      await screenClient.join(
        this.credential.appId,
        this.credential.channelName,
        this.credential.screenShare.token,
        this.credential.screenShare.userId,
      );
      await screenClient.publish(screenTrack);
      this.snapshot.local.screenSharing = true;
      this.upsertParticipant(this.credential.screenShare.userId, {
        displayName: `${this.displayName} · 屏幕`,
        isLocal: true,
        kind: "screen",
        hasVideo: true,
      });
      await this.focusParticipant(this.credential.screenShare.userId);
    } catch (error) {
      screenTrack.close();
      this.screenTrack = null;
      this.screenClient = null;
      await screenClient.leave().catch(() => undefined);
      throw error;
    }
  }

  async stopScreenShare(): Promise<void> {
    const screenId = this.credential?.screenShare?.userId;
    const track = this.screenTrack;
    const client = this.screenClient;
    this.screenTrack = null;
    this.screenClient = null;
    this.snapshot.local.screenSharing = false;

    if (client && track) {
      await client.unpublish(track).catch(() => undefined);
    }
    track?.close();
    await client?.leave().catch(() => undefined);
    if (screenId) this.removeParticipant(screenId);
  }

  async focusParticipant(participantIdToFocus: string | null): Promise<void> {
    this.snapshot.focusedParticipantId = participantIdToFocus;
    const operations: Promise<unknown>[] = [];
    if (this.client) {
      for (const [id, user] of this.remoteUsers) {
        if (!user.hasVideo) continue;
        operations.push(
          this.client
            .setRemoteVideoStreamType(
              user.uid,
              isScreenShareUserId(id) || id === participantIdToFocus ? 0 : 1,
            )
            .catch(() => undefined),
        );
      }
    }
    await Promise.all(operations);
    this.emit();
  }

  attachVideo(id: string, element: HTMLElement): void {
    const targets = this.videoElements.get(id) ?? new Set<HTMLElement>();
    targets.add(element);
    this.videoElements.set(id, targets);
    this.renderVideoTarget(id, element);
  }

  detachVideo(id: string, element: HTMLElement): void {
    this.clearVideoTarget(element);
    const targets = this.videoElements.get(id);
    targets?.delete(element);
    if (targets?.size === 0) this.videoElements.delete(id);
  }

  async renewToken(token: string): Promise<void> {
    if (!this.client) throw new Error("课堂尚未连接");
    await this.client.renewToken(token);
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
    this.preferredMicrophoneId = deviceId;
    if (this.microphoneTrack) await this.microphoneTrack.setDevice(deviceId);
  }

  async setCameraDevice(deviceId: string): Promise<void> {
    if (!deviceId) return;
    this.preferredCameraId = deviceId;
    if (this.cameraTrack) await this.cameraTrack.setDevice(deviceId);
  }

  async setVideoQuality(
    quality: "economy" | "hd" | "fullHd",
  ): Promise<void> {
    const high = classroomVideoPresets[quality].camera.high;
    if (this.cameraTrack) {
      await this.cameraTrack.setEncoderConfiguration({
        width: high.width,
        height: high.height,
        frameRate: high.frameRate,
        bitrateMin: Math.round(high.bitrateKbps * 0.65),
        bitrateMax: high.bitrateKbps,
      });
    }
    this.snapshot.local.videoQuality = quality;
    this.emit();
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
        credential.userId !== this.credential.userId
      ) {
        throw new Error("发布凭证与当前课堂不匹配");
      }
      await this.client.renewToken(credential.token);
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

    const localTracks = [this.microphoneTrack, this.cameraTrack].filter(
      (track): track is IMicrophoneAudioTrack | ICameraVideoTrack =>
        Boolean(track),
    );
    if (localTracks.length > 0) {
      await this.client.unpublish(localTracks).catch(() => undefined);
    }
    this.microphoneTrack?.close();
    this.cameraTrack?.close();
    this.microphoneTrack = null;
    this.cameraTrack = null;
    this.snapshot.local.microphoneOn = false;
    this.snapshot.local.cameraOn = false;
    this.upsertParticipant(this.credential.userId, {
      hasAudio: false,
      hasVideo: false,
    });
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
    await this.stopScreenShare();
    const client = this.client;
    this.client = null;

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
    this.microphoneTrack?.close();
    this.cameraTrack?.close();
    this.microphoneTrack = null;
    this.cameraTrack = null;
    this.remoteUsers.clear();
    this.participants.clear();
    for (const id of this.videoElements.keys()) this.clearVideoTargets(id);
    this.videoElements.clear();
    this.credential = null;
    this.preferredMicrophoneId = undefined;
    this.preferredCameraId = undefined;
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
        videoQuality: "hd",
      },
      focusedParticipantId: null,
    };
    this.emit();
  }
}
