import type { ClassroomSignalingCredential } from "@/lib/classroom/types";

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

export interface ClassroomSignalingProvider {
  connect(
    credential: ClassroomSignalingCredential,
    onInvalidation: (event: ClassroomInvalidation) => void,
  ): Promise<void>;
  publish(event: ClassroomInvalidation): Promise<void>;
  disconnect(): Promise<void>;
}
