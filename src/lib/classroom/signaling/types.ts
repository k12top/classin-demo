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
  | ClassroomCompositionPreview;

export type ClassroomMemberPermissionUpdate = {
  courseId: string;
  topic: "member-permissions";
  actorId: string;
  revision: number;
  scope: "students" | "member";
  targetUserId?: string;
  microphoneAllowed: boolean;
  cameraAllowed?: boolean;
};

export interface ClassroomSignalingProvider {
  connect(
    credential: ClassroomSignalingCredential,
    onEvent: (event: ClassroomSignalingEvent, publisherId?: string) => void,
  ): Promise<void>;
  publish(event: ClassroomSignalingEvent): Promise<void>;
  disconnect(): Promise<void>;
}
