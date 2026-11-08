export {};

declare global {
  interface Window {
    classroomDesktop?: {
      platform: NodeJS.Platform;
      isDesktop: true;
      openHome(): Promise<void>;
      openWorkspace(): Promise<void>;
      listDesktopSources(): Promise<
        Array<{
          id: string;
          name: string;
          displayId: string;
          thumbnailDataUrl: string;
        }>
      >;
    };
  }
}
