import type {
  ClassroomRole,
  ClassroomWhiteboardCredential,
} from "@/lib/classroom/types";

export type WhiteboardJoinInput = {
  courseId: string;
  userId: string;
  role: ClassroomRole;
  writable: boolean;
};

export interface ClassroomWhiteboardProvider {
  readonly name: "netless";
  isConfigured(): boolean;
  issueJoinCredential(
    input: WhiteboardJoinInput,
  ): Promise<ClassroomWhiteboardCredential>;
}
