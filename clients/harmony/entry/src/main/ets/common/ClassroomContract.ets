export type ClassroomRole = 'teacher' | 'assistant' | 'student';
export type ClassroomMode = 'oneToOne' | 'smallClass' | 'largeClass' | 'publicLive';

export interface ClassroomCapabilities {
  canStartClass: boolean;
  canEndClass: boolean;
  canManageStage: boolean;
  canManageMembers: boolean;
  canManageChat: boolean;
  canManageWhiteboard: boolean;
  canShareScreen: boolean;
}

export interface ClassroomBootstrap {
  mode: ClassroomMode;
  courseName: string;
  sessionId: string;
  runtimeStatus: 'waiting' | 'live' | 'ended';
  revision: number;
  capabilities: ClassroomCapabilities;
}

/**
 * UI consumes this interface, not the Agora SDK. The implementation receives
 * temporary credentials only from POST /api/classroom/session.
 */
export interface ClassroomMediaAdapter {
  connect(): Promise<void>;
  leave(): Promise<void>;
  toggleMicrophone(): Promise<boolean>;
  toggleCamera(): Promise<boolean>;
  startScreenShare(): Promise<void>;
  stopScreenShare(): Promise<void>;
}
