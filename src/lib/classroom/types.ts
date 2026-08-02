export type ClassroomRole = "teacher" | "assistant" | "student";
export type ClassroomProviderName = "agora";
export type ClassroomConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

import type {
  ClassroomMode,
  ClassroomModePolicy,
} from "@/lib/classroom/mode";

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
  scenario: "communication" | "liveBroadcasting";
  appId: string;
  channelName: string;
  userId: string;
  role: ClassroomRole;
  publishAllowed?: boolean;
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
    videoQuality: "economy" | "hd" | "fullHd";
  };
  focusedParticipantId: string | null;
};

export type ClassroomMediaListener = (
  snapshot: ClassroomMediaSnapshot,
) => void;

export type ClassroomCaptionInput = {
  id: string;
  text: string;
  sourceLanguage: string;
  detectedLanguage: string;
  translations: Record<string, string>;
  speakerId: string;
  speakerName?: string;
  occurredAt: string;
  isFinal: boolean;
};

export type ClassroomCaptionListener = (caption: ClassroomCaptionInput) => void;

export interface ClassroomMediaProvider {
  connect(
    credential: ClassroomJoinCredential,
    displayName: string,
  ): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(listener: ClassroomMediaListener): () => void;
  subscribeCaptions(listener: ClassroomCaptionListener): () => void;
  getSnapshot(): ClassroomMediaSnapshot;
  toggleMicrophone(): Promise<boolean>;
  toggleCamera(): Promise<boolean>;
  startScreenShare(): Promise<void>;
  stopScreenShare(): Promise<void>;
  focusParticipant(participantId: string | null): Promise<void>;
  attachVideo(participantId: string, element: HTMLElement): void;
  detachVideo(participantId: string, element: HTMLElement): void;
  renewToken(token: string): Promise<void>;
  setPublishingCredential(
    credential: ClassroomJoinCredential | null,
  ): Promise<void>;
  listDevices(): Promise<{
    microphones: MediaDeviceInfo[];
    cameras: MediaDeviceInfo[];
  }>;
  setMicrophoneDevice(deviceId: string): Promise<void>;
  setCameraDevice(deviceId: string): Promise<void>;
  setVideoQuality(quality: "economy" | "hd" | "fullHd"): Promise<void>;
}

export type ClassroomStageMode =
  | "auto"
  | "screen"
  | "whiteboard"
  | "spotlight";

export type ClassroomMemberSnapshot = {
  userId: string;
  displayName: string;
  avatar: string;
  role: ClassroomRole;
  online: boolean;
  onStage: boolean;
  stageState: "offstage" | "invited" | "accepted";
  screenShareState: "idle" | "requested" | "accepted" | "declined";
  screenShareRequestedAt: string | null;
  microphoneAllowed: boolean;
  cameraAllowed: boolean;
  chatMuted: boolean;
  whiteboardWritable: boolean;
  handRaisedAt: string | null;
  rewardCount: number;
};

export type ClassroomMessageSnapshot = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: ClassroomRole;
  scope: "classroom" | "room" | "staff" | "direct";
  spaceId: string | null;
  recipientId: string | null;
  kind: "text" | "system";
  content: string;
  deletedAt: string | null;
  createdAt: string;
};

export type ClassroomSpaceMemberSnapshot = {
  userId: string;
  displayName: string;
  avatar: string;
  role: "assistant" | "student";
  active: boolean;
  microphoneAllowed: boolean;
  cameraAllowed: boolean;
  screenShareAllowed: boolean;
  joinedAt: string | null;
};

export type ClassroomCaptionSnapshot = ClassroomCaptionInput & {
  provider: "shengwang" | "wordly";
  createdAt: string;
};

export type ClassroomCoursewareSnapshot = {
  id: string;
  name: string;
  ext: string;
  size: number;
  taskUuid: string | null;
  taskStatus: string;
  type: string;
  conversion: unknown;
  conversionError: string | null;
  studentCanView: boolean;
  studentCanDownload: boolean;
  whiteboardEnabled: boolean;
  downloadUrl: string | null;
};

export type ClassroomSpaceSnapshot = {
  id: string;
  kind: "main" | "breakout";
  name: string;
  status: "waiting" | "open" | "closed";
  position: number;
  capacity: number | null;
  memberCount: number;
  assistantCount: number;
  isAssigned: boolean;
  members: ClassroomSpaceMemberSnapshot[];
};

export type ClassroomQuestionSnapshot = {
  id: string;
  spaceId: string | null;
  spaceName: string | null;
  askerId: string;
  askerName: string;
  content: string;
  status: "open" | "promoted" | "answered" | "dismissed";
  answer: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type ClassroomCapabilities = {
  canStartClass: boolean;
  canEndClass: boolean;
  canControlRecording: boolean;
  canManageStage: boolean;
  canManageMembers: boolean;
  canManageChat: boolean;
  canManageWhiteboard: boolean;
  canManageInterpretation: boolean;
  canShareScreen: boolean;
  canGiveReward: boolean;
  canRunEngagement: boolean;
  canParticipateInEngagement: boolean;
};

export type ClassroomEngagementSnapshot = {
  activeBuzz: {
    id: string;
    status: "active" | "closed";
    startedAt: string;
    winnerUserId: string | null;
    winnerName: string | null;
    responseCount: number;
  } | null;
  selector: {
    id: string;
    selectedUserId: string | null;
    selectedUserName: string | null;
    selectedUserIds: string[];
    startedAt: string;
  } | null;
};

export type ClassroomRuntimeSnapshot = {
  revision: number;
  status: "waiting" | "live" | "ended";
  startedAt: string | null;
  graceEndsAt: string | null;
  stageMode: ClassroomStageMode;
  stageLocked: boolean;
  spotlightUserId: string | null;
  activeCoursewareId: string | null;
  chatEnabled: boolean;
  timerStartedAt: string | null;
  timerDurationSec: number | null;
  timerPausedAt: string | null;
  interpretation: {
    enabled: boolean;
    provider: "shengwang" | "wordly";
    sourceLanguage: string;
    targetLanguages: string[];
    status:
      | "stopped"
      | "starting"
      | "running"
      | "recovering"
      | "stopping"
      | "failed";
    error: string | null;
  };
  members: ClassroomMemberSnapshot[];
};

export type ClassroomSignalingCredential = {
  provider: "agora-rtm";
  appId: string;
  userId: string;
  channelName: string;
  token: string;
  expiresInSeconds: number;
};

export type ClassroomWhiteboardCredential = {
  enabled: boolean;
  provider: "netless";
  appIdentifier?: string;
  region?: "cn-hz" | "us-sv" | "sg" | "in-mum" | "eu";
  roomUuid?: string;
  roomToken?: string;
  writable: boolean;
  error?: string;
};

export type ClassroomSessionResponse = {
  mode: ClassroomMode;
  modePolicy: ClassroomModePolicy;
  credential: ClassroomJoinCredential;
  mediaProfile: ClassroomMediaProfile;
  course: {
    id: string;
    sessionId: string;
    name: string;
    roomType: number;
    teacherName: string;
    startTime: string | null;
    endTime: string | null;
    status: string;
  };
  runtime: ClassroomRuntimeSnapshot;
  engagement: ClassroomEngagementSnapshot;
  capabilities: ClassroomCapabilities;
  signaling: ClassroomSignalingCredential | null;
  whiteboard: ClassroomWhiteboardCredential;
  courseware: ClassroomCoursewareSnapshot[];
  messages: ClassroomMessageSnapshot[];
  spaces: ClassroomSpaceSnapshot[];
  questions: ClassroomQuestionSnapshot[];
  captions: ClassroomCaptionSnapshot[];
  interpretationAvailability: {
    shengwang: boolean;
    wordly: boolean;
  };
  recording: {
    enabled: boolean;
    status: string | null;
    mode: "web" | "mix" | null;
    fallbackFrom: string | null;
  };
};

export function canPublishInClassroom(role: ClassroomRole): boolean {
  return role === "teacher" || role === "assistant";
}

export function credentialCanPublish(
  credential: Pick<ClassroomJoinCredential, "role" | "publishAllowed">,
): boolean {
  return canPublishInClassroom(credential.role) || credential.publishAllowed === true;
}

export type ClassroomAction =
  | { type: "heartbeat" }
  | { type: "startClass" }
  | { type: "raiseHand" }
  | { type: "lowerHand" }
  | { type: "inviteStage"; targetUserId: string }
  | { type: "acceptStage" }
  | { type: "declineStage" }
  | { type: "removeStage"; targetUserId: string }
  | { type: "requestScreenShare"; targetUserId: string }
  | { type: "acceptScreenShare" }
  | { type: "declineScreenShare" }
  | { type: "stopScreenShare"; targetUserId: string }
  | { type: "setMemberMuted"; targetUserId: string; muted: boolean }
  | {
      type: "setMediaAllowed";
      targetUserId: string;
      microphoneAllowed: boolean;
      cameraAllowed: boolean;
    }
  | { type: "muteAll"; muted: boolean }
  | {
      type: "setWhiteboardWritable";
      targetUserId: string;
      writable: boolean;
    }
  | { type: "setSpotlight"; targetUserId: string | null }
  | {
      type: "setStage";
      mode: ClassroomStageMode;
      locked: boolean;
      coursewareId?: string | null;
    }
  | { type: "setChatEnabled"; enabled: boolean }
  | {
      type: "setInterpretation";
      enabled: boolean;
      provider: "shengwang" | "wordly";
      sourceLanguage: string;
      targetLanguages: string[];
    }
  | { type: "startTimer"; durationSec: number }
  | { type: "pauseTimer" }
  | { type: "resumeTimer" }
  | { type: "resetTimer" }
  | { type: "giveReward"; targetUserIds: string[] }
  | { type: "startBuzz" }
  | { type: "submitBuzz" }
  | { type: "closeBuzz" }
  | { type: "startRandomSelector" }
  | { type: "resetRandomSelector" };

export function isClassroomRole(value: unknown): value is ClassroomRole {
  return value === "teacher" || value === "assistant" || value === "student";
}
