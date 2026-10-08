export class OAuthTokenRequestError extends Error {
  constructor(readonly status: number, readonly oauthCode: string) {
    super(`Auth token request failed (${status}, ${oauthCode || "unavailable"})`);
    this.name = "OAuthTokenRequestError";
  }
}

/** Only an explicit revoked/expired grant is evidence to remove login cookies. */
export function isInvalidRefreshGrant(error: unknown): boolean {
  return error instanceof OAuthTokenRequestError &&
    (error.oauthCode === "invalid_grant" || error.oauthCode === "invalid_token");
}
