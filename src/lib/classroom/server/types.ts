import type {
  ClassroomJoinCredential,
  ClassroomMediaProfile,
  ClassroomProviderName,
  ClassroomRole,
} from "@/lib/classroom/types";

export type IssueClassroomCredentialInput = {
  channelName: string;
  userId: string;
  role: ClassroomRole;
  scenario?: "communication" | "liveBroadcasting";
  publisher?: boolean;
  allowScreenShare?: boolean;
};

export interface ClassroomServerProvider {
  readonly name: ClassroomProviderName;
  issueCredential(
    input: IssueClassroomCredentialInput,
  ): ClassroomJoinCredential;
}

export type RecordingStartInput = {
  recordingId: string;
  courseId: string;
  channelName: string;
  mediaProfile: ClassroomMediaProfile;
  pageUrl?: string | null;
};

export type RecordingStartResult = {
  recorderUserId: string;
  resourceId: string;
  providerSessionId: string;
  providerState: Record<string, unknown>;
  mode: "web" | "mix";
  fallbackFrom?: "web";
};

export type RecordingStopInput = {
  channelName: string;
  recorderUserId: string;
  resourceId: string;
  providerSessionId: string;
  providerState?: Record<string, unknown> | null;
};

export type RecordingStopResult = {
  playbackObjectKey: string | null;
  files: unknown[];
  providerState: Record<string, unknown>;
};

export type RecordingQueryResult = {
  active: boolean;
  providerState: Record<string, unknown>;
};

export interface RecordingProvider {
  readonly name: ClassroomProviderName;
  isConfigured(): boolean;
  start(input: RecordingStartInput): Promise<RecordingStartResult>;
  stop(input: RecordingStopInput): Promise<RecordingStopResult>;
  query(input: RecordingStopInput): Promise<RecordingQueryResult>;
}
