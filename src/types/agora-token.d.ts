// Type declarations for agora-token which doesn't ship its own .d.ts

declare module "agora-token/src/ApaasTokenBuilder" {
  export class ApaasTokenBuilder {
    static buildRoomUserToken(
      appId: string,
      appCertificate: string,
      roomUuid: string,
      userUuid: string,
      role: number,
      expire: number
    ): string;

    static buildUserToken(
      appId: string,
      appCertificate: string,
      userUuid: string,
      expire: number
    ): string;

    static buildAppToken(
      appId: string,
      appCertificate: string,
      expire: number
    ): string;
  }
}
