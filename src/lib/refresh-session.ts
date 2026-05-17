/**
 * Re-issue app session + Casdoor access token using OAuth refresh_token.
 */
import {
  refreshAccessToken,
  parseJwtPayload,
  determineRole,
} from "@/lib/casdoor-server";
import { createSession, deleteSession } from "@/lib/session";

export async function refreshSessionWithToken(
  refreshToken: string
): Promise<boolean> {
  const trimmed = refreshToken.trim();
  if (!trimmed) return false;

  try {
    const tokens = await refreshAccessToken(trimmed);
    const access = tokens.access_token;
    const nextRefresh =
      tokens.refresh_token?.trim() || trimmed;

    const casdoorUser = parseJwtPayload(access);
    const role = determineRole(casdoorUser.roles || []);

    await createSession(
      {
        userId: casdoorUser.id || casdoorUser.name,
        name: casdoorUser.name,
        displayName: casdoorUser.displayName || casdoorUser.name,
        avatar: casdoorUser.avatar || "",
        role,
        email: casdoorUser.email || "",
        casdoorToken: access,
      },
      { refreshToken: nextRefresh }
    );
    return true;
  } catch (e) {
    console.error("refreshSessionWithToken:", e);
    await deleteSession();
    return false;
  }
}
