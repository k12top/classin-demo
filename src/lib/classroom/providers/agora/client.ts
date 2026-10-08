"use client";

import AgoraRTC, {
  type IAgoraRTCClient,
  type IAgoraRTCRemoteUser,
  type ICameraVideoTrack,
  type ILocalVideoTrack,
  type IMicrophoneAudioTrack,
  type UID,
} from "agora-rtc-sdk-ng";
import VirtualBackgroundExtension, {
  type IVirtualBackgroundProcessor,
} from "agora-extension-virtual-background";
import {
  classroomMediaProfile,
  classroomVideoPresets,
} from "@/lib/classroom/config";
import { isScreenShareUserId } from "@/lib/classroom/screen-share";
import { isClassroomScreenRtcUid } from "@/lib/classroom/rtc-uid";
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
  private screenClient: IAgoraRTCClient | null = null;
  private credential: ClassroomJoinCredential | null = null;
  private displayName = "";
  private microphoneTrack: IMicrophoneAudioTrack | null = null;
  private cameraTrack: ICameraVideoTrack | null = null;
  private screenTrack: ILocalVideoTrack | null = null;
  private preferredMicrophoneId: string | undefined;
  private preferredCameraId: string | undefined;
  private virtualBackgroundProcessor: IVirtualBackgroundProcessor | null = null;
  private virtualBackgroundEffect: ClassroomVideoBackgroundEffect = {
    type: "none",
  };
  private remoteUsers = new Map<string, IAgoraRTCRemoteUser>();
  private participants = new Map<string, ClassroomParticipant>();
  private videoElements = new Map<string, Set<HTMLElement>>();
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

  private cameraId() {
    return this.credential ? String(this.credential.rtcUid) : undefined;
  }

  private screenId() {
    return this.credential?.screenShare
      ? String(this.credential.screenShare.rtcUid)
      : undefined;
  }

  private isScreen(id: string) {
    return isClassroomScreenRtcUid(id) || isScreenShareUserId(id);
  }

  private isLocalParticipant(id: string) {
    return (
      id === this.cameraId() ||
      id === this.screenId()
    );
  }

  private displayNameFor(id: string) {
    if (id === this.cameraId()) return this.displayName;
    if (id === this.screenId()) {
      return `${this.displayName} · 屏幕`;
    }
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
      kind: this.isScreen(id) ? "screen" : "camera",
      hasAudio: existing?.hasAudio ?? false,
      hasVideo: existing?.hasVideo ?? false,
      ...existing,
      ...update,
    });
    this.emit();
  }

  private mediaStreamTrackFor(id: string): MediaStreamTrack | null {
    if (id === this.cameraId()) {
      return this.cameraTrack?.getMediaStreamTrack() ?? null;
    }
    if (id === this.screenId()) {
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
    video.dataset.fit = this.isScreen(id) ? "contain" : "cover";
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
    client.on("token-privilege-will-expire", () => this.emitTokenExpiry());
    client.on("token-privilege-did-expire", () => this.emitTokenExpiry());
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
    const id = participantId(user.uid);
    this.remoteUsers.set(id, user);

    // The primary client receives the separate local screen publisher too.
    // Render the local capture directly instead of subscribing to ourselves.
    if (id === this.screenId()) {
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
          this.isScreen(id) ||
            this.snapshot.focusedParticipantId === id
            ? 0
            : 1,
        )
        .catch(() => undefined);
      this.upsertParticipant(id, { hasVideo: true });
      this.renderVideoTargets(id);
    }
  }

  async recoverMedia(force = false): Promise<void> {
    if (!this.client || !this.credential) return;
    if (this.client.connectionState === "DISCONNECTED") {
      await this.client.join(this.credential.appId, this.credential.channelName, this.credential.token, this.credential.rtcUid);
      const tracks = [this.cameraTrack, this.microphoneTrack].filter((track): track is ICameraVideoTrack | IMicrophoneAudioTrack => Boolean(track));
      if (tracks.length) await this.client.publish(tracks);
    }
    // Mobile browsers suspend playback and capture on app switches. Rebind all video targets.
    for (const id of this.videoElements.keys()) this.renderVideoTargets(id);
    for (const user of this.remoteUsers.values()) user.audioTrack?.play();
    if (force) {
      for (const user of this.client.remoteUsers) {
        for (const kind of ["video", "audio"] as const) {
          if (!(kind === "video" ? user.hasVideo : user.hasAudio)) continue;
          await this.client.unsubscribe(user, kind).catch(() => undefined);
          await this.onUserPublished(user, kind);
        }
      }
    }
    const cameraWasOn = this.snapshot.local.cameraOn;
    if (cameraWasOn && this.cameraTrack && (force || this.cameraTrack.getMediaStreamTrack().readyState === "ended" || this.cameraTrack.getMediaStreamTrack().muted)) {
      const track = this.cameraTrack;
      this.cameraTrack = null;
      this.snapshot.local.cameraOn = false;
      await this.client.unpublish(track).catch(() => undefined);
      track.close();
      await this.toggleCamera();
    }
    if (this.snapshot.local.microphoneOn && this.microphoneTrack && (force || this.microphoneTrack.getMediaStreamTrack().readyState === "ended" || this.microphoneTrack.getMediaStreamTrack().muted)) {
      const track = this.microphoneTrack;
      this.microphoneTrack = null;
      this.snapshot.local.microphoneOn = false;
      await this.client.unpublish(track).catch(() => undefined);
      track.close();
      await this.toggleMicrophone();
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
      this.snapshot.local.microphoneOn = true;
      this.upsertParticipant(String(this.credential.rtcUid), { hasAudio: true });
      try { await this.client.publish(this.microphoneTrack); }
      catch (error) { this.microphoneTrack.close(); this.microphoneTrack = null; this.snapshot.local.microphoneOn = false; this.upsertParticipant(String(this.credential.rtcUid), { hasAudio: false }); throw error; }
    } else {
      const next = !this.snapshot.local.microphoneOn;
      const track = this.microphoneTrack;
      track.getMediaStreamTrack().enabled = next;
      this.snapshot.local.microphoneOn = next;
      this.upsertParticipant(String(this.credential.rtcUid), { hasAudio: next });

      try { await track.setMuted(!next); }
      catch (error) { track.getMediaStreamTrack().enabled = !next; this.snapshot.local.microphoneOn = !next; this.upsertParticipant(String(this.credential.rtcUid), { hasAudio: !next });  throw error; }
    }

    this.upsertParticipant(String(this.credential.rtcUid), {
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
      // Phone and tablet cameras can reject desktop encoder dimensions even
      // after permission is granted. Let the SDK choose a supported size.
      const touchCamera = window.matchMedia("(pointer: coarse)").matches;
      const cameraOptions = {
        ...(this.preferredCameraId && {
          cameraId: this.preferredCameraId,
        }),
        ...(!touchCamera && {
          encoderConfig: {
            width: high.width,
            height: high.height,
            frameRate: high.frameRate,
            bitrateMin: Math.round(high.bitrateKbps * 0.65),
            bitrateMax: high.bitrateKbps,
          },
        }),
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
          optimizationMode: "balanced",
        });
      }
      this.cameraTrack = cameraTrack;
      try {
        if (this.virtualBackgroundEffect.type !== "none") {
          await this.applyVirtualBackground();
        }
        this.snapshot.local.cameraOn = true;
        this.upsertParticipant(String(this.credential.rtcUid), { hasVideo: true });
        this.renderVideoTargets(String(this.credential.rtcUid));
        await this.client.publish(cameraTrack);
      } catch (error) {
        await this.releaseVirtualBackgroundProcessor();
        cameraTrack.close();
        this.cameraTrack = null;
        this.snapshot.local.cameraOn = false;
        this.upsertParticipant(String(this.credential.rtcUid), { hasVideo: false });
        this.clearVideoTargets(String(this.credential.rtcUid));
        throw error;
      }
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

    this.upsertParticipant(String(this.credential.rtcUid), {
      hasVideo: this.snapshot.local.cameraOn,
    });
    if (this.snapshot.local.cameraOn) {
      this.renderVideoTargets(String(this.credential.rtcUid));
    } else {
      this.clearVideoTargets(String(this.credential.rtcUid));
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
    screenClient.on("token-privilege-will-expire", () =>
      this.emitTokenExpiry(),
    );
    screenClient.on("token-privilege-did-expire", () =>
      this.emitTokenExpiry(),
    );
    screenTrack.on("track-ended", () => {
      void this.stopScreenShare();
    });

    try {
      await screenClient.join(
        this.credential.appId,
        this.credential.channelName,
        this.credential.screenShare.token,
        this.credential.screenShare.rtcUid,
      );
      await screenClient.publish(screenTrack);
      this.snapshot.local.screenSharing = true;
      this.upsertParticipant(String(this.credential.screenShare.rtcUid), {
        displayName: `${this.displayName} · 屏幕`,
        isLocal: true,
        kind: "screen",
        hasVideo: true,
      });
      await this.focusParticipant(String(this.credential.screenShare.rtcUid));
    } catch (error) {
      screenTrack.close();
      this.screenTrack = null;
      this.screenClient = null;
      await screenClient.leave().catch(() => undefined);
      throw error;
    }
  }

  async stopScreenShare(): Promise<void> {
    const screenId = this.screenId();
    const track = this.screenTrack;
    const client = this.screenClient;
    if (!track && !client && !this.snapshot.local.screenSharing) return;

    this.screenTrack = null;
    this.screenClient = null;
    this.snapshot.local.screenSharing = false;

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
      await client.unpublish(track).catch(() => undefined);
    }
    track?.close();
    await client?.leave().catch(() => undefined);
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
              this.isScreen(id) || id === participantIdToFocus ? 0 : 1,
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

  async renewCredential(credential: ClassroomJoinCredential): Promise<void> {
    if (!this.client || !this.credential) {
      throw new Error("课堂尚未连接");
    }
    if (
      credential.channelName !== this.credential.channelName ||
      credential.userId !== this.credential.userId ||
      credential.rtcUid !== this.credential.rtcUid
    ) {
      throw new Error("续期凭证与当前课堂不匹配");
    }
    await this.client.renewToken(credential.token);
    if (this.screenClient && this.snapshot.local.screenSharing) {
      if (
        !credential.screenShare ||
        credential.screenShare.rtcUid !== this.credential.screenShare?.rtcUid
      ) {
        throw new Error("共享屏幕续期凭证与当前课堂不匹配");
      }
      await this.screenClient.renewToken(credential.screenShare.token);
    }
    this.credential = { ...this.credential, ...credential };
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
    if (this.microphoneTrack) await this.microphoneTrack.setDevice(deviceId);
    this.preferredMicrophoneId = deviceId;
  }

  async setCameraDevice(deviceId: string): Promise<void> {
    if (!deviceId) return;
    if (this.cameraTrack) await this.cameraTrack.setDevice(deviceId);
    this.preferredCameraId = deviceId;
    if (this.credential) this.renderVideoTargets(String(this.credential.rtcUid));
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
    this.snapshot.local.microphoneOn = false;
    this.snapshot.local.cameraOn = false;
    this.upsertParticipant(String(this.credential.rtcUid), {
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
    await this.releaseVirtualBackgroundProcessor();
    this.microphoneTrack?.close();
    this.cameraTrack?.close();
    this.microphoneTrack = null;
    this.cameraTrack = null;
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
        videoQuality: "hd",
      },
      focusedParticipantId: null,
    };
    this.emit();
  }
}
