import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { OAuthTokenRequestError, isInvalidRefreshGrant } from "../src/lib/oauth-token-error";
import { loadModule } from "./helpers/load-module";

function service(avatarError?: Error, tokenError?: Error) {
  let deleted = 0;
  const built = { sessionToken: "new-session", refreshToken: "rotated-refresh" };
  const loaded = loadModule<{ refreshSessionWithToken(value: string): Promise<unknown> }>("src/lib/refresh-session.ts", {
    "@/lib/casdoor-server": {
      refreshAccessToken: async () => { if (tokenError) throw tokenError; return { access_token: "token", refresh_token: "rotated-refresh" }; },
      parseJwtPayload: () => ({ name: "teacher", avatar: "upstream-avatar" }),
      determineRole: () => "teacher",
    },
    "@/lib/casdoor-user": { resolveSessionUserId: () => "teacher-id" },
    "@/lib/user-profile": { resolveUserAvatar: async () => { if (avatarError) throw avatarError; return "custom-avatar"; } },
    "@/lib/db": { isTransientDatabaseError: (error: Error) => /timeout exceeded when trying to connect/.test(error.message) },
    "@/lib/oauth-token-error": { isInvalidRefreshGrant },
    "@/lib/session": { buildSessionCookies: async () => built, deleteSession: async () => { deleted++; } },
  });
  return { ...loaded, built, deleted: () => deleted };
}

test("database timeout while reading avatar preserves login and rotated refresh token", async () => {
  const s = service(new Error("timeout exceeded when trying to connect"));
  assert.equal(await s.refreshSessionWithToken("old-refresh"), s.built);
  assert.equal(s.deleted(), 0);
});

test("temporary identity provider outage does not delete login cookies", async () => {
  const s = service(undefined, new OAuthTokenRequestError(503, "temporarily_unavailable"));
  await assert.rejects(s.refreshSessionWithToken("refresh"), /503/);
  assert.equal(s.deleted(), 0);
});

test("explicit invalid refresh grant deletes invalid credentials", async () => {
  const s = service(undefined, new OAuthTokenRequestError(400, "invalid_grant"));
  assert.equal(await s.refreshSessionWithToken("refresh"), null);
  assert.equal(s.deleted(), 1);
});

test("both refresh routes report 503 instead of redirecting/logging out during outages", async () => {
  const route = loadModule<{ GET(request: NextRequest): Promise<Response>; POST(): Promise<Response> }>("src/app/api/auth/refresh/route.ts", {
    "next/headers": { cookies: async () => ({ get: () => ({ value: "refresh" }) }) },
    "@/lib/session": { OAUTH_REFRESH_COOKIE: "refresh", attachSessionCookies: () => assert.fail("Must not attach cookies") },
    "@/lib/refresh-session": { refreshSessionWithToken: async () => { throw new Error("DB timeout"); } },
    "@/lib/auth-login": { safeNextPath: () => "/", SSO_LOGIN_PATH: "/api/auth/login" },
  });
  for (const response of [await route.GET(new NextRequest("https://classroom.example/api/auth/refresh")), await route.POST()]) {
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("location"), null);
    assert.equal((await response.json()).code, "REFRESH_UNAVAILABLE");
  }
});

test("simultaneous client refreshes share one rotation; 503 throws and 401 returns false", async () => {
  let calls = 0;
  let status = 503;
  const client = loadModule<{ tryOAuthRefresh(): Promise<boolean> }>("src/lib/auth-refresh-client.ts", {}, {
    fetch: async () => { calls++; await Promise.resolve(); return new Response(null, { status }); },
  });
  const results = await Promise.allSettled([client.tryOAuthRefresh(), client.tryOAuthRefresh()]);
  assert.equal(calls, 1);
  assert.ok(results.every((value) => value.status === "rejected"));
  status = 401;
  assert.equal(await client.tryOAuthRefresh(), false);
});
