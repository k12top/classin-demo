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
import { resolveUserAvatar } from "@/lib/user-profile";
import { isTransientDatabaseError } from "@/lib/db";
import { isInvalidRefreshGrant } from "@/lib/oauth-token-error";

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
    const userId = resolveSessionUserId(casdoorUser, role);
    // Avatar customization must not invalidate a successfully rotated token.
    let avatar = casdoorUser.avatar || "";
    try {
      avatar = await resolveUserAvatar(userId, avatar);
    } catch (error) {
      if (!isTransientDatabaseError(error)) throw error;
      console.warn("[auth:refresh] profile temporarily unavailable; using upstream avatar");
    }

    return await buildSessionCookies(
      {
        userId,
        name: casdoorUser.name,
        displayName: casdoorUser.displayName || casdoorUser.name,
        avatar,
        role,
        email: casdoorUser.email || "",
      },
      { refreshToken: nextRefresh }
    );
  } catch (e) {
    console.error("refreshSessionWithToken:", e);
    if (isInvalidRefreshGrant(e)) {
      await deleteSession();
      return null;
    }
    // Network, database and provider outages are retryable, not logout events.
    throw e;
  }
}
