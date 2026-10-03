export {};

declare global {
  interface Window {
    classroomDesktop?: {
      platform: NodeJS.Platform;
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
