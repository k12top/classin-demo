"use client";

import AgoraRTC, {
  type IAgoraRTCClient,
  type IAgoraRTCRemoteUser,
  type ICameraVideoTrack,
  type ILocalVideoTrack,
  type IMicrophoneAudioTrack,
  type UID,
} from "agora-rtc-sdk-ng";
import { classroomMediaProfile } from "@/lib/classroom/config";
import { isScreenShareUserId } from "@/lib/classroom/screen-share";
import {
  canPublishInClassroom,
  type ClassroomConnectionState,
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
  private remoteUsers = new Map<string, IAgoraRTCRemoteUser>();
  private participants = new Map<string, ClassroomParticipant>();
  private videoElements = new Map<string, HTMLElement>();
  private listeners = new Set<ClassroomMediaListener>();
  private snapshot: ClassroomMediaSnapshot = {
    connectionState: "idle",
    participants: [],
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

  getSnapshot(): ClassroomMediaSnapshot {
    return {
      ...this.snapshot,
      participants: this.snapshot.participants.map((participant) => ({
        ...participant,
      })),
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

  private removeParticipant(id: string) {
    this.remoteUsers.delete(id);
    this.participants.delete(id);
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

    const publishing = canPublishInClassroom(credential.role);
    const client = AgoraRTC.createClient({
      mode: "live",
      codec: "vp8",
      role: publishing ? "host" : "audience",
    });
    this.client = client;

    client.on("connection-state-change", (state) => {
      this.snapshot.connectionState = connectionState(state);
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
      await client.enableDualStream();
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
      const element = this.videoElements.get(id);
      if (element && user.videoTrack) {
        user.videoTrack.play(element, {
          fit: isScreenShareUserId(id) ? "contain" : "cover",
        });
      }
    }
  }

  async toggleMicrophone(): Promise<boolean> {
    if (!this.client || !this.credential) {
      throw new Error("课堂尚未连接");
    }
    if (!canPublishInClassroom(this.credential.role)) {
      throw new Error("学生需要老师邀请上台后才能发言");
    }

    if (!this.microphoneTrack) {
      this.microphoneTrack = await AgoraRTC.createMicrophoneAudioTrack({
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
    if (!canPublishInClassroom(this.credential.role)) {
      throw new Error("学生需要老师邀请上台后才能开启摄像头");
    }

    if (!this.cameraTrack) {
      const high = classroomMediaProfile.camera.high;
      this.cameraTrack = await AgoraRTC.createCameraVideoTrack({
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
    const element = this.videoElements.get(this.credential.userId);
    if (element && this.snapshot.local.cameraOn) {
      this.cameraTrack.play(element, { fit: "cover", mirror: true });
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
      mode: "live",
      codec: "vp8",
      role: "host",
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
    this.videoElements.set(id, element);
    if (id === this.credential?.userId && this.cameraTrack) {
      this.cameraTrack.play(element, { fit: "cover", mirror: true });
      return;
    }
    if (id === this.credential?.screenShare?.userId && this.screenTrack) {
      this.screenTrack.play(element, { fit: "contain" });
      return;
    }
    const user = this.remoteUsers.get(id);
    if (user?.videoTrack) {
      user.videoTrack.play(element, {
        fit: isScreenShareUserId(id) ? "contain" : "cover",
      });
    }
  }

  detachVideo(id: string): void {
    this.videoElements.delete(id);
    const user = this.remoteUsers.get(id);
    user?.videoTrack?.stop();
    if (id === this.credential?.userId) this.cameraTrack?.stop();
    if (id === this.credential?.screenShare?.userId) this.screenTrack?.stop();
  }

  async renewToken(token: string): Promise<void> {
    if (!this.client) throw new Error("课堂尚未连接");
    await this.client.renewToken(token);
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
    this.videoElements.clear();
    this.credential = null;
    this.snapshot = {
      connectionState: "disconnected",
      participants: [],
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

