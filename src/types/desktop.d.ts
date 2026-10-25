export {};

declare global {
  interface Window {
    classroomDesktop?: {
      platform: NodeJS.Platform;
      isDesktop: true;
      openLocalRecordings(context: { sessionId: string; title: string }): Promise<void>;
      onLocalRecordingState(callback: (state: { status: "idle" | "recording" | "paused" | "stopping" | "interrupted" }) => void): () => void;
    };
  }
}
