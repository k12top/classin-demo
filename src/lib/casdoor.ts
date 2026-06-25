/**
 * Auth JS SDK — client-side configuration
 * Used for SSO redirect login flow
 */
import Sdk from "casdoor-js-sdk";

const sdkConfig = {
  serverUrl: process.env.NEXT_PUBLIC_CASDOOR_SERVER_URL || "",
  clientId: process.env.NEXT_PUBLIC_CASDOOR_CLIENT_ID || "",
  appName: process.env.NEXT_PUBLIC_CASDOOR_APP_NAME || "",
  organizationName: process.env.NEXT_PUBLIC_CASDOOR_ORG_NAME || "",
  redirectPath: "/api/auth/callback",
};

export const casdoorSdk = new Sdk(sdkConfig);

/**
 * Get the full sign-in URL for SSO.
 */
export function getSignInUrl(): string {
  return casdoorSdk.getSigninUrl();
}
