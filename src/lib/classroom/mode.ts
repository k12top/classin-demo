export type ClassroomMode =
  | "oneToOne"
  | "smallClass"
  | "largeClass"
  | "publicLive";

export type ClassroomModePolicy = {
  roomType: 0 | 2 | 4 | 10;
  mode: ClassroomMode;
  rtcScenario: "communication" | "liveBroadcasting";
  layout: "paired" | "seminar" | "lecture" | "broadcast";
  maxParticipants: number | null;
  maxStageStudents: number;
  showLiveRail: boolean;
  showMemberRoster: boolean;
  showHandRaise: boolean;
  showPublicQuestions: boolean;
  allowBreakouts: boolean;
  defaultStudentOnStage: boolean;
  defaultStudentWhiteboardWritable: boolean;
  studentCanRequestStage: boolean;
  studentCanShareWhenOnStage: boolean;
};

const POLICIES: Record<ClassroomMode, ClassroomModePolicy> = {
  oneToOne: {
    roomType: 0,
    mode: "oneToOne",
    rtcScenario: "communication",
    layout: "paired",
    maxParticipants: 2,
    maxStageStudents: 1,
    showLiveRail: false,
    showMemberRoster: true,
    showHandRaise: false,
    showPublicQuestions: false,
    allowBreakouts: false,
    defaultStudentOnStage: true,
    // Being on the 1:1 stage grants media participation, not the ability to
    // alter shared teaching material. A teacher or assistant must explicitly
    // grant a student temporary board access, just as in every other mode.
    defaultStudentWhiteboardWritable: false,
    studentCanRequestStage: false,
    studentCanShareWhenOnStage: true,
  },
  smallClass: {
    roomType: 4,
    mode: "smallClass",
    rtcScenario: "communication",
    layout: "seminar",
    maxParticipants: 16,
    maxStageStudents: 6,
    showLiveRail: true,
    showMemberRoster: true,
    showHandRaise: true,
    showPublicQuestions: false,
    allowBreakouts: false,
    defaultStudentOnStage: false,
    defaultStudentWhiteboardWritable: false,
    studentCanRequestStage: true,
    studentCanShareWhenOnStage: true,
  },
  largeClass: {
    roomType: 2,
    mode: "largeClass",
    rtcScenario: "liveBroadcasting",
    layout: "lecture",
    maxParticipants: 500,
    maxStageStudents: 6,
    showLiveRail: true,
    showMemberRoster: true,
    showHandRaise: true,
    showPublicQuestions: true,
    allowBreakouts: true,
    defaultStudentOnStage: false,
    defaultStudentWhiteboardWritable: false,
    studentCanRequestStage: true,
    studentCanShareWhenOnStage: true,
  },
  publicLive: {
    roomType: 10,
    mode: "publicLive",
    rtcScenario: "liveBroadcasting",
    layout: "broadcast",
    maxParticipants: null,
    maxStageStudents: 1,
    showLiveRail: false,
    showMemberRoster: false,
    showHandRaise: false,
    showPublicQuestions: true,
    allowBreakouts: false,
    defaultStudentOnStage: false,
    defaultStudentWhiteboardWritable: false,
    studentCanRequestStage: false,
    studentCanShareWhenOnStage: false,
  },
};

export function classroomModeFromRoomType(roomType: number): ClassroomMode {
  if (roomType === 0) return "oneToOne";
  if (roomType === 2) return "largeClass";
  if (roomType === 10) return "publicLive";
  return "smallClass";
}

export function classroomModePolicy(roomType: number): ClassroomModePolicy {
  return POLICIES[classroomModeFromRoomType(roomType)];
}

export function isInteractiveClassroomMode(mode: ClassroomMode): boolean {
  return mode !== "publicLive";
}
