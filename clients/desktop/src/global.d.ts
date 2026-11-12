export {};

declare global {
  interface Window {
    classroomDesktop?: {
      getCachedCourses(userId: string): Promise<{ok:boolean;status?:number;error?:string;cached?:boolean;savedAt?:number;data?:{courses:unknown[]}}> ;
      platform: NodeJS.Platform;
      canReceiveRemoteControl?: boolean;
      isDesktop: true;
      openHome(): Promise<void>;
      openWorkspace(): Promise<void>;
      enterClassroom(url: string): Promise<{ ok: boolean; status?: number; error?: string }>;
      entryReady(): Promise<void>;
      closeClassroom(): Promise<void>;
      setSharingState(sharing: boolean): Promise<void>;
      startRemoteControl(input: {clientId:string;grantId:string}): Promise<boolean>;
      setRemoteControlRequest(input: {clientId:string;grantId:string} | null): Promise<boolean>;
      onRemoteControlRequestState(callback: (state: {grantId:string;pending:boolean;busy?:boolean;error?:boolean;decision?:string;teacherId?:string}) => void): () => void;
      stopRemoteControl(): Promise<boolean>;
      receiveRemoteControl(packet: unknown): Promise<boolean>;
      onRemoteControlState(callback: (state: {active:boolean;reason?:string;grantId:string}) => void): () => void;
      setSharingControls(controls: { microphoneOn: boolean; cameraOn: boolean; microphoneEnabled: boolean; cameraEnabled: boolean; membersEnabled: boolean; inkEnabled?: boolean }): Promise<void>;
      setSharingChatSnapshot?: (snapshot: { disabled: boolean; translationState?: "off" | "pending" | "failed" | "unavailable" | "ready"; channels?: { scope: "classroom" | "room" | "staff"; spaceId: string | null }[]; messages: { id?: string; name: string; content: string; translation?: string | null; kind: "text" | "system" | "image"; scope?: "classroom" | "room" | "staff" | "direct" }[] }) => Promise<void>;
      reportSharingChatResult?: (id: string, ok: boolean) => Promise<void>;
      onSharingChatTranslationRetry?: (callback: () => void) => () => void;
      onSharingChatSend?: (callback: (request: { id: string; clientMessageId?: string; text: string; scope?: "classroom" | "room" | "staff"; spaceId?: string | null }) => void) => () => void;
      onSharingChatImage?: (callback: (request: { id: string; messageId: string }) => void) => () => void;
      reportSharingChatImage?: (id: string, data: string | null) => Promise<void>;
      setSharingSeats(rect: { x: number; y: number; width: number; height: number } | null): Promise<void>;
      onSharingCommand(callback: (command: "stop" | "settings" | "members" | "microphone" | "camera") => void): () => void;
      onScreenInk(callback: (stroke: { points: { x: number; y: number }[]; color: string; width: number; aspect: number }) => void): () => void;
      reportScreenInkFailure(): Promise<void>;
    };
  }
}
