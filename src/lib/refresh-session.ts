/**
 * Re-issue app session and upstream access token using OAuth refresh_token.
 */
import {
  refreshAccessToken,
  parseJwtPayload,
  determineRole,
} from "@/lib/casdoor-server";
import { resolveSessionUserId } from "@/lib/casdoor-user";
import {
  buildSessionCookies,
  deleteSession,
  type BuiltSessionCookies,
} from "@/lib/session";

export async function refreshSessionWithToken(
  refreshToken: string
): Promise<BuiltSessionCookies | null> {
  const trimmed = refreshToken.trim();
  if (!trimmed) return null;

  try {
    const tokens = await refreshAccessToken(trimmed);
    const access = tokens.access_token;
    const nextRefresh =
      tokens.refresh_token?.trim() || trimmed;

    const casdoorUser = parseJwtPayload(access);
    const role = determineRole(casdoorUser.roles || [], casdoorUser.groups);

    return await buildSessionCookies(
      {
        userId: resolveSessionUserId(casdoorUser, role),
        name: casdoorUser.name,
        displayName: casdoorUser.displayName || casdoorUser.name,
        avatar: casdoorUser.avatar || "",
        role,
        email: casdoorUser.email || "",
      },
      { refreshToken: nextRefresh }
    );
  } catch (e) {
    console.error("refreshSessionWithToken:", e);
    await deleteSession();
    return null;
  }
}
