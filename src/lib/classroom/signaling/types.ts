import type {
  ClassroomBoardRect,
  ClassroomSignalingCredential,
} from "@/lib/classroom/types";

export type ClassroomInvalidation = {
  courseId: string;
  revision: number;
  topic:
    | "runtime"
    | "members"
    | "messages"
    | "courseware"
    | "recording"
    | "captions"
    | "engagement";
};

export type ClassroomCompositionPreview = {
  courseId: string;
  topic: "composition-preview";
  actorId: string;
  itemId: string;
  rect: ClassroomBoardRect;
  sentAt: number;
};

export type ClassroomSignalingEvent =
  | ClassroomInvalidation
  | ClassroomMemberPermissionUpdate
  | ClassroomScreenShareRequest
  | ClassroomHandRaiseUpdate
  | ClassroomCompositionPreview
  | ClassroomDeviceAck;

export type ClassroomHandRaiseUpdate = {
  commandId?: string;
  courseId: string;
  topic: "hand-raise";
  actorId: string;
  revision: number;
  handRaisedAt: string | null;
};

export type ClassroomScreenShareRequest = {
  commandId?: string;
  courseId: string;
  topic: "screen-share-request";
  actorId: string;
  revision: number;
  targetUserId: string;
  requestedAt: string;
};

export type ClassroomMemberPermissionUpdate = {
  commandId?: string;
  courseId: string;
  topic: "member-permissions";
  actorId: string;
  revision: number;
  scope: "students" | "member";
  targetUserId?: string;
  microphoneAllowed: boolean;
  cameraAllowed?: boolean;
};

export type ClassroomDeviceState = "on" | "off" | "pending" | "interrupted" | "failed" | "unknown";
export type ClassroomDeviceAck = {
  courseId: string; topic: "device-ack"; commandId: string; actorId: string; revision: number;
  microphone: ClassroomDeviceState; camera: ClassroomDeviceState;
};

export interface ClassroomSignalingProvider {
  connect(
    credential: ClassroomSignalingCredential,
    onEvent: (event: ClassroomSignalingEvent, publisherId?: string) => void,
    onHealth?: (ready: boolean) => void,
  ): Promise<void>;
  publish(event: ClassroomSignalingEvent): Promise<void>;
  publishToUser?(userId: string, event: ClassroomDeviceAck): Promise<void>;
  disconnect(): Promise<void>;
}
