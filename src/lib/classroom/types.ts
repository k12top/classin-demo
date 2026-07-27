export type ClassroomRole = "teacher" | "assistant" | "student";
export type ClassroomProviderName = "agora";
export type ClassroomConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type VideoProfile = {
  width: number;
  height: number;
  frameRate: number;
  bitrateKbps: number;
};

export type ClassroomMediaProfile = {
  camera: {
    low: VideoProfile;
    high: VideoProfile;
  };
  screen: VideoProfile & {
    optimizationMode: "detail" | "motion" | "balanced";
  };
  recording: VideoProfile;
};

export type ClassroomJoinCredential = {
  provider: ClassroomProviderName;
  appId: string;
  channelName: string;
  userId: string;
  role: ClassroomRole;
  token: string;
  expiresInSeconds: number;
  screenShare?: {
    userId: string;
    token: string;
  };
};

export type ClassroomParticipant = {
  id: string;
  displayName: string;
  isLocal: boolean;
  kind: "camera" | "screen";
  hasAudio: boolean;
  hasVideo: boolean;
};

export type ClassroomMediaSnapshot = {
  connectionState: ClassroomConnectionState;
  participants: ClassroomParticipant[];
  local: {
    microphoneOn: boolean;
    cameraOn: boolean;
    screenSharing: boolean;
  };
  focusedParticipantId: string | null;
};

export type ClassroomMediaListener = (
  snapshot: ClassroomMediaSnapshot,
) => void;

export interface ClassroomMediaProvider {
  connect(
    credential: ClassroomJoinCredential,
    displayName: string,
  ): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(listener: ClassroomMediaListener): () => void;
  getSnapshot(): ClassroomMediaSnapshot;
  toggleMicrophone(): Promise<boolean>;
  toggleCamera(): Promise<boolean>;
  startScreenShare(): Promise<void>;
  stopScreenShare(): Promise<void>;
  focusParticipant(participantId: string | null): Promise<void>;
  attachVideo(participantId: string, element: HTMLElement): void;
  detachVideo(participantId: string): void;
  renewToken(token: string): Promise<void>;
}

export type ClassroomSessionResponse = {
  credential: ClassroomJoinCredential;
  mediaProfile: ClassroomMediaProfile;
  course: {
    id: string;
    name: string;
    teacherName: string;
    startTime: string | null;
    endTime: string | null;
    status: string;
  };
  recording: {
    enabled: boolean;
    status: string | null;
  };
};

export function canPublishInClassroom(role: ClassroomRole): boolean {
  return role === "teacher" || role === "assistant";
}

export function isClassroomRole(value: unknown): value is ClassroomRole {
  return value === "teacher" || value === "assistant" || value === "student";
}

